import { isTauri } from "@tauri-apps/api/core";

export function isBrowserDevMode(): boolean {
  return !isTauri();
}
