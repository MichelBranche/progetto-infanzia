export function streamingProviderLabel(catalogPrefix?: string): string {
  switch (catalogPrefix) {
    case "loonex":
      return "Loonex";
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
    case "saturn":
      return "Saturn";
    case "sc":
      return "Streaming Community";
    default:
      return "Branchefy";
  }
}
