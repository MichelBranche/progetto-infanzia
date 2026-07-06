import { useCallback, useEffect, useMemo, useState } from "react";
import { listStreamingList, toggleStreamingList } from "./addonsApi";
import { syncAchievements } from "./achievementsApi";
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
      const key = streamingListKey(preview);
      const wasInList = streamingListKeys.has(key);

      setStreamingList((current) => {
        if (wasInList) {
          return current.filter((item) => streamingListKey(item) !== key);
        }
        return [...current, { ...preview, inMyList: true }];
      });

      try {
        const added = await toggleStreamingList(
          profileId,
          previewToListInput(preview),
        );
        await refresh();
        void syncAchievements(profileId);
        return added;
      } catch {
        await refresh();
        return wasInList;
      }
    },
    [profileId, refresh, streamingListKeys],
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
