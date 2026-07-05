import { createContext, useContext, type ReactNode } from "react";
import { useChatMessageAlerts } from "../hooks/useChatMessageAlerts";

const ChatMessageAlertsContext = createContext<true | null>(null);

export function ChatMessageAlertsProvider({ children }: { children: ReactNode }) {
  useChatMessageAlerts();
  return (
    <ChatMessageAlertsContext.Provider value={true}>
      {children}
    </ChatMessageAlertsContext.Provider>
  );
}

export function useChatMessageAlertsContext() {
  const ctx = useContext(ChatMessageAlertsContext);
  if (!ctx) {
    throw new Error(
      "useChatMessageAlertsContext must be used within ChatMessageAlertsProvider",
    );
  }
  return ctx;
}
