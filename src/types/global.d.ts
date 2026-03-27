// Ambient declarations for packages without @types

declare module 'word-extractor' {
  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
    getAnnotations(): string;
  }
  class WordExtractor {
    extract(source: string | Buffer): Promise<WordDocument>;
  }
  export = WordExtractor;
}
