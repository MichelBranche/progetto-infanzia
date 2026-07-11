export const FRIEND_REQUESTS_EVENT = "branchefy:open-friend-requests";

export function openFriendRequestsScreen() {
  window.dispatchEvent(new CustomEvent(FRIEND_REQUESTS_EVENT));
}
