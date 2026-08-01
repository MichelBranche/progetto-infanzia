export function streamingProviderLabel(catalogPrefix?: string): string {
  switch (catalogPrefix) {
    case "loonex":
      return "Loonex";
    case "youtube":
      return "YouTube";
    case "raiplay":
      return "RaiPlay";
    case "mediaset":
      return "Mediaset Infinity";
    case "saturn":
      return "Saturn";
    case "sc":
      return "Streaming Community";
    default:
      return "Streaming";
  }
}

export function streamingProviderShort(catalogPrefix?: string): string {
  switch (catalogPrefix) {
    case "loonex":
      return "Loonex";
    case "youtube":
      return "YouTube";
    case "raiplay":
      return "RaiPlay";
    case "mediaset":
      return "Mediaset";
    case "saturn":
      return "Saturn";
    case "sc":
      return "SC";
    default:
      return "Web";
  }
}

export function streamingProviderIncluded(catalogPrefix?: string): string {
  switch (catalogPrefix) {
    case "loonex":
      return "Loonex";
    case "youtube":
      return "YouTube";
    case "raiplay":
      return "RaiPlay";
    case "mediaset":
      return "Mediaset Infinity";
    case "saturn":
      return "Saturn";
    case "sc":
      return "Streaming Community";
    default:
      return "Branchefy";
  }
}
