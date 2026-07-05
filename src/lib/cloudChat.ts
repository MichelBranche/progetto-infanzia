import { getSupabase } from "./supabaseClient";
import type { ChatConversation, ChatMessage } from "../types/chat";

function mapMessage(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapConversation(row: Record<string, unknown>): ChatConversation {
  const last = row.last_message as Record<string, unknown> | null | undefined;
  const peer = row.direct_peer as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id),
    kind: row.kind as ChatConversation["kind"],
    title: row.title ? String(row.title) : undefined,
    watchPartyCode: row.watch_party_code ? String(row.watch_party_code) : undefined,
    updatedAt: String(row.updated_at),
    memberCount: Number(row.member_count ?? 0),
    lastMessage: last
      ? {
          id: String(last.id),
          body: String(last.body),
          senderId: String(last.sender_id),
          createdAt: String(last.created_at),
        }
      : undefined,
    directPeer: peer
      ? {
          userId: String(peer.user_id),
          displayName: String(peer.display_name),
          avatarUrl: peer.avatar_url ? String(peer.avatar_url) : undefined,
          friendCode: peer.friend_code ? String(peer.friend_code) : undefined,
        }
      : undefined,
  };
}

export function openChatNavigation(conversationId: string) {
  sessionStorage.setItem("branchefy-pending-chat-id", conversationId);
  window.dispatchEvent(new CustomEvent("branchefy:open-chat"));
}

export async function consumePendingChatId(): Promise<string | null> {
  const id = sessionStorage.getItem("branchefy-pending-chat-id");
  if (id) sessionStorage.removeItem("branchefy-pending-chat-id");
  return id;
}

export async function listMyChats(): Promise<ChatConversation[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("list_my_chats");
  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapConversation(row as Record<string, unknown>));
}

export async function openDirectChat(otherUserId: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase.rpc("open_direct_chat", {
    other_user_id: otherUserId,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function createGroupChat(
  title: string,
  memberIds: string[],
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase.rpc("create_group_chat", {
    chat_title: title.trim(),
    member_ids: memberIds,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function ensureWatchPartyChat(roomCode: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase.rpc("ensure_watch_party_chat", {
    room_code: roomCode.trim().toUpperCase(),
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function fetchChatMessages(
  conversationId: string,
  limit = 80,
): Promise<ChatMessage[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapMessage);
}

export async function sendChatMessage(
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const trimmed = body.trim();
  if (!trimmed) throw new Error("Scrivi un messaggio");

  const { data, error } = await supabase.rpc("send_chat_message", {
    conv_id: conversationId,
    message_body: trimmed,
  });
  if (error) throw new Error(error.message);
  return mapMessage(data as {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
  });
}

export function subscribeChatMessages(
  conversationId: string,
  onMessage: () => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`chat-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => onMessage(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeIncomingChatMessages(
  onMessage: (message: ChatMessage) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel("chat-incoming")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
      },
      (payload) => {
        const row = payload.new as {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
        onMessage(mapMessage(row));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function chatDisplayTitle(chat: ChatConversation): string {
  if (chat.kind === "direct") {
    return chat.directPeer?.displayName ?? "Amico";
  }
  if (chat.kind === "watch_party") {
    return chat.title ?? `Stanza ${chat.watchPartyCode ?? ""}`;
  }
  return chat.title ?? "Gruppo";
}
