const activeConversationIds = new Set<string>();

export function setChatViewActive(conversationId: string | null, active: boolean) {
  if (!conversationId) return;
  if (active) activeConversationIds.add(conversationId);
  else activeConversationIds.delete(conversationId);
}

export function isChatViewActive(conversationId: string) {
  return activeConversationIds.has(conversationId);
}
