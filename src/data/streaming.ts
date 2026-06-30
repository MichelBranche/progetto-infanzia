export interface StreamingService {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
}

export const STREAMING_SERVICES: StreamingService[] = [
  { id: "netflix", label: "Netflix", shortLabel: "N", color: "#e50914" },
  { id: "prime", label: "Prime Video", shortLabel: "P", color: "#00a8e1" },
  { id: "disney", label: "Disney+", shortLabel: "D", color: "#113ccf" },
  { id: "apple", label: "Apple TV+", shortLabel: "A", color: "#d6d6d6" },
  { id: "paramount", label: "Paramount+", shortLabel: "Pa", color: "#0064ff" },
  { id: "now", label: "NOW", shortLabel: "NOW", color: "#00c8aa" },
];

export function streamingSearchUrl(serviceId: string, title: string): string {
  const q = encodeURIComponent(title);
  switch (serviceId) {
    case "netflix":
      return `https://www.netflix.com/search?q=${q}`;
    case "prime":
      return `https://www.primevideo.com/search/ref=atv_sr_sug?phrase=${q}`;
    case "disney":
      return `https://www.disneyplus.com/search?q=${q}`;
    case "apple":
      return `https://tv.apple.com/search?term=${q}`;
    case "paramount":
      return `https://www.paramountplus.com/search/?q=${q}`;
    case "now":
      return `https://www.nowtv.it/watch/search?q=${q}`;
    default:
      return `https://www.google.com/search?q=${q}+streaming`;
  }
}

export function serviceById(id: string): StreamingService | undefined {
  return STREAMING_SERVICES.find((s) => s.id === id);
}
