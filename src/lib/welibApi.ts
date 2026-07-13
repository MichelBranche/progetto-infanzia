import { isTauri } from "@tauri-apps/api/core";
import { runtimeInvoke } from "./runtimeInvoke";
import type { WelibBook, WelibPopularResponse, WelibSearchResponse } from "../types/welib";

const WELIB_TIMEOUT_MS = 45_000;
const STREAM_PORT = 17890;

function backendOrigin(): string {
  const configured = import.meta.env.VITE_BRANCHEFY_API_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "";
}

/** URL proxy in-memory per leggere un libro online (nessun download su disco). */
export function welibBookStreamUrl(md5: string, format?: string | null): string {
  const params = format?.trim()
    ? `?format=${encodeURIComponent(format.trim())}`
    : "";
  if (isTauri()) {
    return `http://127.0.0.1:${STREAM_PORT}/welib-book/${md5}${params}`;
  }
  return `${backendOrigin()}/welib-book/${md5}${params}`;
}

/** URL proxy per copertine WeLib (CDN con referer). */
export function welibCoverProxyUrl(coverUrl: string): string {
  const encoded = encodeURIComponent(coverUrl);
  if (isTauri()) {
    return `http://127.0.0.1:${STREAM_PORT}/welib-cover/${encoded}`;
  }
  return `${backendOrigin()}/welib-cover/${encoded}`;
}

/** URL proxy per audiobook in streaming. */
export function welibAudioStreamUrl(md5: string): string {
  if (isTauri()) {
    return `http://127.0.0.1:${STREAM_PORT}/welib-audio/${md5}`;
  }
  return `${backendOrigin()}/welib-audio/${md5}`;
}

export async function fetchPopularBooks(
  interval = "24h",
  offset = 0,
  limit = 20,
): Promise<WelibPopularResponse> {
  return runtimeInvoke<WelibPopularResponse>(
    "welib_popular_cmd",
    { interval, offset, limit },
    WELIB_TIMEOUT_MS,
  );
}

export async function searchBooks(
  query: string,
  page = 1,
): Promise<WelibSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [], limited: false };
  }
  return runtimeInvoke<WelibSearchResponse>(
    "welib_search_cmd",
    { query: trimmed, page },
    WELIB_TIMEOUT_MS,
  );
}

export function bookAuthorsLabel(book: WelibBook): string {
  if (book.authors.length === 0) return "Autore sconosciuto";
  return book.authors.join(", ");
}

export function bookFormatLabel(format?: string | null): string {
  if (!format?.trim()) return "Libro";
  return format.trim();
}
