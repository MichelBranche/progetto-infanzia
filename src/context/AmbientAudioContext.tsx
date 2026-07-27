import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AmbientAudioControls {
  forcePaused: boolean;
  setForcePaused: (paused: boolean) => void;
}

const AmbientAudioContext = createContext<AmbientAudioControls | null>(null);

export function AmbientAudioProvider({ children }: { children: ReactNode }) {
  const [forcePaused, setForcePausedState] = useState(false);
  const setForcePaused = useCallback((paused: boolean) => {
    setForcePausedState(paused);
  }, []);

  const value = useMemo(
    () => ({ forcePaused, setForcePaused }),
    [forcePaused, setForcePaused],
  );

  return (
    <AmbientAudioContext.Provider value={value}>
      {children}
    </AmbientAudioContext.Provider>
  );
}

export function useAmbientAudioControls() {
  const ctx = useContext(AmbientAudioContext);
  if (!ctx) {
    throw new Error("useAmbientAudioControls must be used within AmbientAudioProvider");
  }
  return ctx;
}

export function useAmbientAudioControlsOptional() {
  return useContext(AmbientAudioContext);
}
