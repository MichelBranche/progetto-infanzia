import { isWebShell } from "./runtimeInvoke";

export interface WebAppUpdateInfo {
  needsReload: boolean;
  remoteVersion?: string;
  title?: string;
}

export async function checkWebAppUpdate(): Promise<WebAppUpdateInfo> {
  if (!isWebShell() || !import.meta.env.PROD) {
    return { needsReload: false };
  }

  const current = import.meta.env.VITE_APP_VERSION;
  if (!current || current === "dev") {
    return { needsReload: false };
  }

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return { needsReload: false };
    const payload = (await response.json()) as {
      version?: string;
      title?: string;
    };
    if (payload.version && payload.version !== current) {
      return {
        needsReload: true,
        remoteVersion: payload.version,
        title: payload.title,
      };
    }
  } catch {
    return { needsReload: false };
  }

  return { needsReload: false };
}

export function reloadWebApp(): void {
  window.location.reload();
}
