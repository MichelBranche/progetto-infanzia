import { useCallback, useEffect, useMemo, useState } from "react";
import { listStreamingList, toggleStreamingList } from "./addonsApi";
import {
  markStreamingInMyList,
  previewToListInput,
  streamingListKey,
} from "./myList";
import type { StremioMetaPreview } from "../types/stremio";

export function useMyList(profileId: string) {
  const [streamingList, setStreamingList] = useState<StremioMetaPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setStreamingList([]);
      setLoading(false);
      return;
    }
    try {
      const items = await listStreamingList(profileId);
      setStreamingList(items);
    } catch {
      setStreamingList([]);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const streamingListKeys = useMemo(
    () => new Set(streamingList.map(streamingListKey)),
    [streamingList],
  );

  const toggleStreaming = useCallback(
    async (preview: StremioMetaPreview) => {
      if (!profileId) return false;
      const added = await toggleStreamingList(profileId, previewToListInput(preview));
      await refresh();
      return added;
    },
    [profileId, refresh],
  );

  const withMyListFlags = useCallback(
    (preview: StremioMetaPreview) => markStreamingInMyList(preview, streamingListKeys),
    [streamingListKeys],
  );

  return {
    streamingList,
    streamingListKeys,
    loading,
    refresh,
    toggleStreaming,
    withMyListFlags,
  };
}
