import { execSync } from 'node:child_process';
import { NextResponse } from 'next/server';

interface ChangelogItem {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

const CHANGELOG_LIMIT = 15;

function readGitChangelog(limit: number): ChangelogItem[] {
  const format = '%H|%h|%s|%an|%aI';
  const command = `git log -n ${limit} --date=iso-strict --pretty=format:${format}`;
  const raw = execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  }).trim();

  if (!raw) return [];

  return raw
    .split('\n')
    .map((line) => {
      const [hash, shortHash, message, author, date] = line.split('|');
      return {
        hash: hash ?? '',
        shortHash: shortHash ?? '',
        message: message ?? '',
        author: author ?? '',
        date: date ?? '',
      };
    })
    .filter((item) => item.hash && item.shortHash && item.message);
}

export async function GET() {
  try {
    const items = readGitChangelog(CHANGELOG_LIMIT);

    return NextResponse.json({
      source: 'git',
      generatedAt: new Date().toISOString(),
      items,
    });
  } catch {
    return NextResponse.json({
      source: 'fallback',
      generatedAt: new Date().toISOString(),
      items: [],
      message: 'История изменений недоступна в текущем окружении.',
    });
  }
}
