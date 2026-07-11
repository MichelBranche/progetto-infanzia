export const CHAT_POPUP_EVENT = "branchefy:open-chat-popup";
export const CHAT_POPUP_CLOSE_EVENT = "branchefy:close-chat-popup";

export interface ChatPopupOpenDetail {
  conversationId: string;
  title?: string;
}

export interface ChatPopupCloseDetail {
  conversationId?: string;
  watchPartyCode?: string;
}

export function openChatPopup(conversationId: string, title?: string) {
  window.dispatchEvent(
    new CustomEvent<ChatPopupOpenDetail>(CHAT_POPUP_EVENT, {
      detail: { conversationId, title },
    }),
  );
}

export function closeChatPopup(detail: ChatPopupCloseDetail = {}) {
  window.dispatchEvent(
    new CustomEvent<ChatPopupCloseDetail>(CHAT_POPUP_CLOSE_EVENT, {
      detail,
    }),
  );
}
