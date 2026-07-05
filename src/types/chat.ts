export type ChatKind = "direct" | "group" | "watch_party";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ChatPeer {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  friendCode?: string;
}

export interface ChatConversation {
  id: string;
  kind: ChatKind;
  title?: string;
  watchPartyCode?: string;
  updatedAt: string;
  lastMessage?: {
    id: string;
    body: string;
    senderId: string;
    createdAt: string;
  };
  memberCount: number;
  directPeer?: ChatPeer;
}
