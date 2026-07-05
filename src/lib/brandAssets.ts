export const ARCHIVIO_CARTONI_LOGO = "/brand/archivio-cartoni-logo.png";

export function isArchivioCartoniRow(key: string, title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    key === "home-cartoni" ||
    key === "cartoni" ||
    key.includes("loonex") ||
    key.includes("youtube") ||
    normalized === "cartoni loonex" ||
    normalized === "archivio cartoni" ||
    normalized === "classici su youtube" ||
    normalized === "cartoni"
  );
}
