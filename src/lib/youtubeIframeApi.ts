export type YtPlayer = {
  destroy: () => void;
  loadVideoById: (videoId: string) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume?: (volume: number) => void;
  getVolume?: () => number;
};

export type YtNamespace = {
  Player: new (
    elementId: string,
    config: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onStateChange?: (event: { data: number; target: YtPlayer }) => void;
        onReady?: (event: { target: YtPlayer }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YtPlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_SCRIPT_ID = "youtube-iframe-api";
let ytApiPromise: Promise<YtNamespace> | null = null;

export function loadYouTubeApi(): Promise<YtNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const finish = () => {
      if (window.YT?.Player) resolve(window.YT);
      else window.setTimeout(finish, 40);
    };

    if (!document.getElementById(YT_SCRIPT_ID)) {
      const tag = document.createElement("script");
      tag.id = YT_SCRIPT_ID;
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish();
    };
    finish();
  });

  return ytApiPromise;
}

export function youtubeVideoIdFromStreamUrl(url: string): string | null {
  const trimmed = url.trim();
  const patterns = [
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
