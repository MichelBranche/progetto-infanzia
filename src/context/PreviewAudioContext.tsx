import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

const PREVIEW_AUDIO_KEY = "branchefy-preview-audio";

function readPreviewAudio(): boolean {
  try {
    return localStorage.getItem(PREVIEW_AUDIO_KEY) === "true";
  } catch {
    return false;
  }
}

interface PreviewAudioContextValue {
  previewAudio: boolean;
  togglePreviewAudio: () => void;
  focusedCardId: string | null;
  playbackActive: boolean;
  setPlaybackActive: (active: boolean) => void;
  claimCardPreviewFocus: (mediaId: string) => void;
  releaseCardPreviewFocus: (mediaId: string) => void;
  isPreviewMuted: (owner: "hero" | string, active: boolean) => boolean;
}

const PreviewAudioContext = createContext<PreviewAudioContextValue | null>(null);

export function PreviewAudioProvider({ children }: { children: ReactNode }) {
  const [previewAudio, setPreviewAudio] = useState(readPreviewAudio);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [playbackActive, setPlaybackActive] = useState(false);

  const togglePreviewAudio = useCallback(() => {
    setPreviewAudio((current) => {
      const next = !current;
      try {
        localStorage.setItem(PREVIEW_AUDIO_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const claimCardPreviewFocus = useCallback((mediaId: string) => {
    setFocusedCardId(mediaId);
  }, []);

  const releaseCardPreviewFocus = useCallback((mediaId: string) => {
    setFocusedCardId((current) => (current === mediaId ? null : current));
  }, []);

  const isPreviewMuted = useCallback(
    (owner: "hero" | string, active: boolean) => {
      if (playbackActive || !active || !previewAudio) return true;
      if (owner === "hero") return focusedCardId !== null;
      return focusedCardId !== owner;
    },
    [previewAudio, focusedCardId, playbackActive],
  );

  return (
    <PreviewAudioContext.Provider
      value={{
        previewAudio,
        togglePreviewAudio,
        focusedCardId,
        playbackActive,
        setPlaybackActive,
        claimCardPreviewFocus,
        releaseCardPreviewFocus,
        isPreviewMuted,
      }}
    >
      {children}
    </PreviewAudioContext.Provider>
  );
}

export function usePreviewAudio() {
  const ctx = useContext(PreviewAudioContext);
  if (!ctx) {
    throw new Error("usePreviewAudio must be used within PreviewAudioProvider");
  }
  return ctx;
}
