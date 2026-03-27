"""AST-aware code chunking using Tree-sitter, with fallback to semantic text chunking."""

from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from common import TREE_SITTER_LANGS


@dataclass
class Chunk:
    text: str
    file_path: str
    language: str
    chunk_type: str  # "function", "class", "method", "module", "text"
    name: Optional[str] = None  # function/class name
    start_line: int = 0
    end_line: int = 0

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "file_path": self.file_path,
            "language": self.language,
            "chunk_type": self.chunk_type,
            "name": self.name or "",
            "start_line": self.start_line,
            "end_line": self.end_line,
        }


# Node types that represent top-level extractable units per language
EXTRACTABLE_NODES = {
    "python": {"function_definition", "class_definition", "decorated_definition"},
    "javascript": {
        "function_declaration", "class_declaration", "export_statement",
        "lexical_declaration", "variable_declaration",
    },
    "typescript": {
        "function_declaration", "class_declaration", "export_statement",
        "lexical_declaration", "interface_declaration", "type_alias_declaration",
    },
    "go": {"function_declaration", "method_declaration", "type_declaration"},
    "rust": {"function_item", "impl_item", "struct_item", "enum_item", "trait_item"},
    "java": {"class_declaration", "method_declaration", "interface_declaration"},
    "c": {"function_definition", "struct_specifier", "enum_specifier"},
    "cpp": {"function_definition", "class_specifier", "struct_specifier"},
    "ruby": {"method", "class", "module"},
    "php": {"function_definition", "class_declaration", "method_declaration"},
    "c_sharp": {"class_declaration", "method_declaration", "interface_declaration"},
}


def _get_ts_parser(language: str):
    """Get a Tree-sitter parser for the given language."""
    try:
        import tree_sitter
        # Dynamic import of language grammar
        lang_module = __import__(f"tree_sitter_{language}")
        lang = tree_sitter.Language(lang_module.language())
        parser = tree_sitter.Parser(lang)
        return parser, lang
    except (ImportError, Exception):
        return None, None


def _extract_node_text(source: bytes, node) -> str:
    """Extract source text for a tree-sitter node."""
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _get_node_name(node, language: str) -> Optional[str]:
    """Try to extract the name of a function/class node."""
    for child in node.children:
        if child.type in ("identifier", "name", "property_identifier"):
            return child.text.decode("utf-8", errors="replace")
        # For decorated definitions (Python), look deeper
        if child.type in EXTRACTABLE_NODES.get(language, set()):
            return _get_node_name(child, language)
    return None


def chunk_code_file(filepath: Path, max_chunk_tokens: int = 800) -> list[Chunk]:
    """Chunk a code file using Tree-sitter AST parsing."""
    suffix = filepath.suffix.lower()
    language = TREE_SITTER_LANGS.get(suffix)
    if not language:
        return chunk_text_file(filepath)

    source = filepath.read_bytes()
    parser, lang = _get_ts_parser(language)
    if parser is None:
        return chunk_text_file(filepath)

    tree = parser.parse(source)
    root = tree.root_node
    extractable = EXTRACTABLE_NODES.get(language, set())

    chunks = []
    covered_ranges = []

    # Extract top-level functions, classes, etc.
    for node in root.children:
        if node.type in extractable:
            text = _extract_node_text(source, node)
            # If chunk is too large, it's likely a big class — split by methods
            if len(text.split()) > max_chunk_tokens and node.type in (
                "class_definition", "class_declaration", "class_specifier",
                "impl_item",
            ):
                class_chunks = _split_class(source, node, filepath, language)
                chunks.extend(class_chunks)
            else:
                name = _get_node_name(node, language)
                chunks.append(Chunk(
                    text=text,
                    file_path=str(filepath),
                    language=language,
                    chunk_type=_classify_node(node.type),
                    name=name,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))
            covered_ranges.append((node.start_byte, node.end_byte))

    # Collect uncovered top-level code (imports, constants, etc.)
    uncovered = _collect_uncovered(source, root, covered_ranges)
    if uncovered.strip():
        chunks.insert(0, Chunk(
            text=uncovered,
            file_path=str(filepath),
            language=language,
            chunk_type="module",
            name="(module-level)",
            start_line=1,
            end_line=0,
        ))

    # Fallback: if AST produced nothing, use text chunking
    if not chunks:
        return chunk_text_file(filepath)

    return chunks


def _split_class(source: bytes, class_node, filepath: Path, language: str) -> list[Chunk]:
    """Split a large class into per-method chunks with class signature as context."""
    # Get class signature (first line or two)
    class_text = _extract_node_text(source, class_node)
    first_lines = class_text.split("\n")[:2]
    class_header = "\n".join(first_lines)
    class_name = _get_node_name(class_node, language)

    method_types = {
        "function_definition", "method_declaration", "function_declaration",
        "method", "function_item",
    }

    chunks = []
    for child in class_node.children:
        # Recurse into body nodes
        for node in (child.children if child.type in ("block", "class_body", "declaration_list") else [child]):
            if node.type in method_types:
                method_text = _extract_node_text(source, node)
                method_name = _get_node_name(node, language)
                # Prefix with class context
                full_text = f"# Class: {class_name}\n{class_header}\n  ...\n\n{method_text}"
                chunks.append(Chunk(
                    text=full_text,
                    file_path=str(filepath),
                    language=language,
                    chunk_type="method",
                    name=f"{class_name}.{method_name}" if class_name and method_name else method_name,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                ))

    # If no methods found, return whole class as one chunk
    if not chunks:
        chunks.append(Chunk(
            text=class_text,
            file_path=str(filepath),
            language=language,
            chunk_type="class",
            name=class_name,
            start_line=class_node.start_point[0] + 1,
            end_line=class_node.end_point[0] + 1,
        ))

    return chunks


def _classify_node(node_type: str) -> str:
    """Map tree-sitter node type to a simpler category."""
    if "class" in node_type or "struct" in node_type or "impl" in node_type:
        return "class"
    if "function" in node_type or "method" in node_type:
        return "function"
    if "interface" in node_type or "trait" in node_type:
        return "interface"
    if "type" in node_type or "enum" in node_type:
        return "type"
    return "other"


def _collect_uncovered(source: bytes, root_node, covered_ranges: list) -> str:
    """Collect source text not covered by any extracted node."""
    covered = set()
    for start, end in covered_ranges:
        covered.update(range(start, end))

    uncovered_bytes = []
    for i in range(len(source)):
        if i not in covered:
            uncovered_bytes.append(source[i:i+1])

    return b"".join(uncovered_bytes).decode("utf-8", errors="replace")


def chunk_text_file(filepath: Path, max_lines: int = 60) -> list[Chunk]:
    """Chunk a text/config file by semantic sections (headers, blank line groups)."""
    try:
        content = filepath.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    lines = content.split("\n")
    if not lines:
        return []

    # For markdown: split by headers
    if filepath.suffix.lower() in (".md", ".rst"):
        return _chunk_by_headers(lines, filepath, max_lines)

    # For other text: split by blank lines into groups
    return _chunk_by_paragraphs(lines, filepath, max_lines)


def _chunk_by_headers(lines: list[str], filepath: Path, max_lines: int) -> list[Chunk]:
    """Split markdown by headers."""
    chunks = []
    current_lines = []
    current_name = "(top)"
    start_line = 1

    for i, line in enumerate(lines):
        if line.startswith("#") and current_lines:
            text = "\n".join(current_lines)
            if text.strip():
                chunks.append(Chunk(
                    text=text, file_path=str(filepath), language="markdown",
                    chunk_type="text", name=current_name,
                    start_line=start_line, end_line=i,
                ))
            current_lines = [line]
            current_name = line.lstrip("#").strip()
            start_line = i + 1
        else:
            current_lines.append(line)

    # Last section
    if current_lines:
        text = "\n".join(current_lines)
        if text.strip():
            chunks.append(Chunk(
                text=text, file_path=str(filepath), language="markdown",
                chunk_type="text", name=current_name,
                start_line=start_line, end_line=len(lines),
            ))

    return chunks


def _chunk_by_paragraphs(lines: list[str], filepath: Path, max_lines: int) -> list[Chunk]:
    """Split text into chunks by blank line boundaries, respecting max size."""
    chunks = []
    current = []
    start_line = 1

    for i, line in enumerate(lines):
        current.append(line)
        if (not line.strip() and len(current) >= max_lines // 2) or len(current) >= max_lines:
            text = "\n".join(current)
            if text.strip():
                chunks.append(Chunk(
                    text=text, file_path=str(filepath),
                    language=filepath.suffix.lstrip(".") or "text",
                    chunk_type="text", name=f"lines {start_line}-{i+1}",
                    start_line=start_line, end_line=i + 1,
                ))
            current = []
            start_line = i + 2

    if current:
        text = "\n".join(current)
        if text.strip():
            chunks.append(Chunk(
                text=text, file_path=str(filepath),
                language=filepath.suffix.lstrip(".") or "text",
                chunk_type="text", name=f"lines {start_line}-{len(lines)}",
                start_line=start_line, end_line=len(lines),
            ))

    return chunks
