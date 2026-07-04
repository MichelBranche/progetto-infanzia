/** Miniatura MangaDex: si appende `.256.jpg` al filename completo (es. `uuid.jpg.256.jpg`). */
export function mangaCoverThumbUrl(
  coverUrl: string | null,
  size: 256 | 512 = 256,
): string | null {
  if (!coverUrl) return null;
  const suffix = `.${size}.jpg`;
  if (coverUrl.endsWith(suffix)) return coverUrl;
  return `${coverUrl}${suffix}`;
}
