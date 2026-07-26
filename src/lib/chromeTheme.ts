export type ChromeMode = "colored" | "white";

const STORAGE_KEY = "branchefy-chrome-mode";
export const CHROME_MODE_EVENT = "branchefy:chrome-mode";

export function readChromeMode(): ChromeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "white" || raw === "colored") return raw;
  } catch {
    // ignore
  }
  return "colored";
}

export function writeChromeMode(mode: ChromeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  applyChromeMode(mode);
  window.dispatchEvent(new CustomEvent(CHROME_MODE_EVENT, { detail: mode }));
}

/** Applica data-chrome sull'html (prima del paint o al cambio impostazione). */
export function applyChromeMode(mode: ChromeMode = readChromeMode()): void {
  document.documentElement.dataset.chrome = mode;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", mode === "white" ? "#f1f2f6" : "#050505");
  }
}
