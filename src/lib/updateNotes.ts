export interface UpdateNotesSection {
  title?: string;
  items: string[];
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
      current = { title: heading[1].trim(), items: [] };
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      current.items.push(bullet[1].trim());
      continue;
    }

    if (/^branchefy\s+v?\d/i.test(line) || /^###\s*(windows|macos)/i.test(line)) {
      continue;
    }

    current.items.push(line);
  }

  flush();
  return sections.filter((s) => s.items.length > 0);
}
