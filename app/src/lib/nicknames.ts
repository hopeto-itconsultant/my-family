// Nickname/pet-name handling: the UI uses a single comma-separated field,
// the DB stores a normalized text[] (migration 0010).

/** Parse "Appa, Annachi , da" → ["Appa","Annachi","da"] (trimmed, deduped, ≤10). */
export function parseNicknames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim().replace(/\s+/g, ' ');
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    if (seen.size >= 10) break; // generous cap per person
    seen.add(key);
    out.push(v); // keep the first spelling as typed (case preserved)
  }
  return out;
}

export function formatNicknames(list: string[] | null | undefined): string {
  return (list ?? []).join(', ');
}
