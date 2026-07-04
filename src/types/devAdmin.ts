export interface DevCloudFriend {
  friendId: string;
  displayName: string;
  email: string;
  friendCode: string;
}

export interface DevCloudWatchEvent {
  titleName: string;
  contentType?: string;
  episodeLabel?: string;
  secondsWatched: number;
  watchedAt: string;
}

export interface DevCloudTopTitle {
  titleName: string;
  totalSeconds: number;
  playCount: number;
}

export interface DevCloudUser {
  userId: string;
  email: string;
  authCreatedAt: string;
  lastSignInAt?: string;
  emailConfirmed: boolean;
  hasProfile: boolean;
  displayName?: string;
  friendCode?: string;
  profileCreatedAt?: string;
  friendsCount: number;
  presenceStatus?: string;
  lastSeenAt?: string;
  presenceActivity?: string;
  appVersion?: string;
  platform?: string;
  friends: DevCloudFriend[];
  recentWatches: DevCloudWatchEvent[];
  topTitles: DevCloudTopTitle[];
}

export interface DevLocalTopTitle {
  title: string;
  totalSeconds: number;
  playCount: number;
}

export interface DevLocalProfileInsight {
  id: string;
  name: string;
  role: string;
  recentSessions: Array<{
    id: string;
    profileId: string;
    mediaId: string;
    mediaTitle: string;
    startedAt: string;
    endedAt?: string;
    secondsWatched: number;
    completed: boolean;
    sourceKind: string;
  }>;
  topTitles: DevLocalTopTitle[];
  friends: Array<{
    friendCode: string;
    displayName: string;
    lastHost?: string;
    addedAt: string;
  }>;
}

export interface DevLocalDashboard {
  profiles: DevLocalProfileInsight[];
}
