import type { BrowseItem } from "../lib/browse";
import type { StremioMetaPreview } from "../types/stremio";
import { MediaRow } from "./MediaRow";

interface RelatedTitlesSectionProps {
  items: BrowseItem[];
  onPlay: (id: string) => void;
  onPlayStreaming?: (preview: StremioMetaPreview) => void;
  onOpenDetail?: (browse: BrowseItem) => void;
  onOpenSeries?: (seriesKey: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleStreamingList?: (preview: StremioMetaPreview) => void;
  onEdit?: (id: string) => void;
}

export function RelatedTitlesSection({
  items,
  onPlay,
  onPlayStreaming,
  onOpenDetail,
  onOpenSeries,
  onToggleFavorite,
  onToggleStreamingList,
  onEdit,
}: RelatedTitlesSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="lf-title-detail__section">
      <MediaRow
        index="∞"
        title="Potrebbero piacerti anche"
        titleClassName="lf-title-detail__section-title"
        items={items}
        animateEntrance
        showReflection
        onPlay={onPlay}
        onPlayStreaming={onPlayStreaming}
        onOpenDetail={onOpenDetail}
        onOpenSeries={onOpenSeries}
        onToggleFavorite={onToggleFavorite}
        onToggleStreamingList={onToggleStreamingList}
        onEdit={onEdit}
      />
    </section>
  );
}
