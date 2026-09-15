/**
 * Avatar initials for a person's name. The single source of truth: no screen
 * should hardcode initials or re-derive them.
 *
 * "Rejan Karki"        -> "RK"
 * "Prashant Bhattarai" -> "PB"
 * "John Smith"         -> "JS"
 * "Rejan"              -> "R"
 * "  ada   lovelace  " -> "AL"
 * ""                   -> "" (callers decide the placeholder)
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}
