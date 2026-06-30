/** Addon di terze parti (Cinemeta, stream torrent, ecc.) — disattivati. */
export const STREMIO_ADDONS_ENABLED = false;

export function isBuiltinStreamingCatalog(catalogPrefix?: string): boolean {
  return catalogPrefix === "sc" || catalogPrefix === "saturn";
}

export function isStremioAddonPreview(preview: {
  catalogPrefix?: string;
}): boolean {
  return !isBuiltinStreamingCatalog(preview.catalogPrefix);
}
