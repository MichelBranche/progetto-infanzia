export interface CloudProfile {
  id: string;
  email: string;
  displayName: string;
  friendCode: string;
  createdAt: string;
}

export interface CloudFriend {
  userId: string;
  displayName: string;
  friendCode: string;
  email?: string;
}

export interface FriendPresence {
  userId: string;
  status: "online" | "away" | "offline";
  lastSeenAt: string;
  activity?: string;
  isOnline: boolean;
}

export interface LanFriendPresence {
  friendCode: string;
  displayName: string;
  online: boolean;
  lastHost?: string;
}

export interface CloudFriendRequest {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  requester?: CloudProfile;
  addressee?: CloudProfile;
}
