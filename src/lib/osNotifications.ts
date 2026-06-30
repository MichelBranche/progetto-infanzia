import { isTauri } from "@tauri-apps/api/core";

export async function sendOsNotification(
  title: string,
  body?: string,
): Promise<void> {
  try {
    if (isTauri()) {
      const {
        isPermissionGranted,
        requestPermission,
        sendNotification,
      } = await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (granted) {
        sendNotification({ title, body });
      }
      return;
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      }
    }
  } catch {
    // notifiche OS opzionali
  }
}
