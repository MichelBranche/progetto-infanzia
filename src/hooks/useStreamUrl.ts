import { useEffect, useState } from "react";
import { getCachedStreamUrl } from "../lib/streamCache";

export function useStreamUrl(
  profileId: string | undefined,
  mediaId: string | undefined,
  enabled: boolean,
) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !profileId || !mediaId) {
      setUrl(null);
      setError(false);
      return;
    }

    let cancelled = false;
    setError(false);

    getCachedStreamUrl(profileId, mediaId)
      .then((streamUrl) => {
        if (!cancelled) setUrl(streamUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileId, mediaId, enabled]);

  return { url, error };
}
