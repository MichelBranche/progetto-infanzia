import { useMemo } from "react";
import { MediaGrid } from "./MediaGrid";
import type { MediaItem } from "../types/media";
import type { StremioMetaPreview } from "../types/stremio";
import { toBrowseItems } from "../lib/browse";
import { enrichStreamingPreview } from "../lib/unifiedBrowse";
import { streamingBrowseItem } from "../lib/streamingBrowse";
import { markStreamingInMyList } from "../lib/myList";

interface MyListPageProps {
  localFavorites: MediaItem[];
  streamingItems: StremioMetaPreview[];
  streamingListKeys: Set<string>;
  onPlay: (id: string) => void;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
}

export function MyListPage({
  localFavorites,
  streamingItems,
  streamingListKeys,
  onPlay,
  onPlayStreaming,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
}: MyListPageProps) {
  const items = useMemo(() => {
    const streaming = streamingItems.map((preview) =>
      streamingBrowseItem(
        markStreamingInMyList(enrichStreamingPreview(preview), streamingListKeys),
      ),
    );
    return [...streaming, ...toBrowseItems(localFavorites)];
  }, [localFavorites, streamingItems, streamingListKeys]);

  return (
    <>
      <div className="page-px pt-24 sm:pt-28">
        <span className="font-display text-[11px] tabular-nums text-text-muted sm:text-xs">
          —
        </span>
        <h2 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
          La mia Lista
        </h2>
        <p className="mt-2 text-[14px] text-text-secondary sm:text-[15px]">
          Titoli salvati con + per guardarli dopo
        </p>
      </div>

      {items.length === 0 ? (
        <div className="page-px flex flex-col items-center justify-center py-24 text-center">
          <p className="max-w-sm text-[15px] text-text-secondary">
            La lista è vuota. Premi + su un titolo per salvarlo qui.
          </p>
        </div>
      ) : (
        <MediaGrid
          items={items}
          onPlay={onPlay}
          onPlayStreaming={onPlayStreaming}
          onToggleFavorite={onToggleFavorite}
          onToggleStreamingList={onToggleStreamingList}
          onEdit={onEdit}
        />
      )}
    </>
  );
}
