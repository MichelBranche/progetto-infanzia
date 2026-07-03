export interface UpdateNotesSection {
  title?: string;
  items: string[];
}

export type UpdateNotesSectionKind =
  | "features"
  | "improvements"
  | "fixes"
  | "other";

const SECTION_KIND_RULES: Array<{ kind: UpdateNotesSectionKind; pattern: RegExp }> = [
  { kind: "features", pattern: /novit|feature|nuov/i },
  { kind: "improvements", pattern: /miglior|improve|enhancement/i },
  { kind: "fixes", pattern: /correz|fix|bug|hotfix/i },
];

export function updateNotesSectionKind(title?: string): UpdateNotesSectionKind {
  const normalized = title?.trim().toLowerCase() ?? "";
  for (const rule of SECTION_KIND_RULES) {
    if (rule.pattern.test(normalized)) return rule.kind;
  }
  return "other";
}

export function updateNotesSectionLabel(kind: UpdateNotesSectionKind): string {
  switch (kind) {
    case "features":
      return "Novità";
    case "improvements":
      return "Miglioramenti";
    case "fixes":
      return "Correzioni";
    default:
      return "Altro";
  }
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim();
}

function shouldSkipLine(line: string): boolean {
  return (
    /^branchefy\s+v?\d/i.test(line) ||
    /^###\s*(windows|macos)/i.test(line) ||
    /^install(er)?\s/i.test(line) ||
    /^scarica\s/i.test(line) ||
    /^firma\s/i.test(line) ||
    /^aggiornamento automatico/i.test(line)
  );
}

/** Parse GitHub / Tauri release notes into titled bullet sections. */
export function parseUpdateNotes(body?: string | null): UpdateNotesSection[] {
  if (!body?.trim()) return [];

  const sections: UpdateNotesSection[] = [];
  let current: UpdateNotesSection = { items: [] };

  const flush = () => {
    if (current.title || current.items.length > 0) {
      sections.push(current);
    }
    current = { items: [] };
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      current = { title: stripInlineMarkdown(heading[1]), items: [] };
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      const item = stripInlineMarkdown(bullet[1]);
      if (item && !shouldSkipLine(item)) current.items.push(item);
      continue;
    }

    if (shouldSkipLine(line)) continue;

    const plain = stripInlineMarkdown(line);
    if (plain) current.items.push(plain);
  }

  flush();
  return sections.filter((s) => s.items.length > 0);
}

export function countUpdateNotesItems(sections: UpdateNotesSection[]): number {
  return sections.reduce((sum, section) => sum + section.items.length, 0);
}
