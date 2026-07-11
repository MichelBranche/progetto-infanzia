import { isTauri } from "@tauri-apps/api/core";

/** Costante sincrona: true nell'app desktop Tauri / WebView2. */
export const IS_TAURI_SHELL = isTauri();
