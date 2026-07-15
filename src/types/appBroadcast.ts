export type AppBroadcastType = "info" | "warning" | "maintenance" | "essential";

export interface AppBroadcast {
  id: string;
  title: string;
  body: string;
  messageType: AppBroadcastType;
  startsAt: string;
  endsAt: string;
  dismissible: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppBroadcastInput {
  title: string;
  body: string;
  messageType: AppBroadcastType;
  startsAt: string;
  endsAt: string;
  dismissible: boolean;
  enabled: boolean;
}

export const APP_BROADCAST_TYPE_LABELS: Record<AppBroadcastType, string> = {
  info: "Informazione",
  warning: "Avviso",
  maintenance: "Manutenzione",
  essential: "Essenziale (bloccante)",
};

export function appBroadcastTypeLabel(type: AppBroadcastType): string {
  return APP_BROADCAST_TYPE_LABELS[type] ?? type;
}
