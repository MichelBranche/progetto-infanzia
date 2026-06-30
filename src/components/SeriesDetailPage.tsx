import { useCallback, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { MediaItem } from "../types/media";
import { useLibrary } from "../context/LibraryContext";
import { useProfile } from "../context/ProfileContext";
import { getCachedStreamUrl } from "../lib/streamCache";
import {
  getSeriesEpisodes,
  getSeriesResumeEpisode,
  isWatchInProgress,
  parseSeriesKey,
  type SeriesRef,
} from "../lib/browse";
import { titleDetailFromSeriesKey } from "../lib/titleDetail";
import { TitleDetailPage } from "./TitleDetailPage";

interface SeriesDetailPageProps {
  seriesKey: string;
  items: MediaItem[];
  isParent: boolean;
  onBack: () => void;
  onPlay: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onAddEpisode: (series: SeriesRef) => void;
}

export function SeriesDetailPage({
  seriesKey,
  items,
  isParent,
  onBack,
  onPlay,
  onEdit,
  onDelete,
  onAddEpisode,
}: SeriesDetailPageProps) {
  const { toggleFavorite } = useLibrary();
  const { activeProfile } = useProfile();
  const [myListLoading, setMyListLoading] = useState(false);
  const series = parseSeriesKey(seriesKey);
  if (!series) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-secondary">Serie non trovata</p>
      </div>
    );
  }

  const episodes = getSeriesEpisodes(items, series);
  const detail = titleDetailFromSeriesKey(seriesKey, items);
  if (!detail || episodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-secondary">Serie non trovata</p>
      </div>
    );
  }

  const resumeEpisode = getSeriesResumeEpisode(episodes);
  const firstEpisode = episodes[0];
  const hasInProgressResume =
    resumeEpisode != null && isWatchInProgress(resumeEpisode);
  const listEpisode = firstEpisode;
  const isInMyList = listEpisode?.isFavorite ?? false;

  const handleToggleMyList = useCallback(async () => {
    if (!listEpisode) return;
    setMyListLoading(true);
    try {
      await toggleFavorite(listEpisode.id);
    } finally {
      setMyListLoading(false);
    }
  }, [listEpisode, toggleFavorite]);

  const resolveEpisodeStream = useCallback(
    async (episodeId: string) => {
      if (!activeProfile?.id) return null;
      try {
        const url = await getCachedStreamUrl(activeProfile.id, episodeId);
        return { url, isHls: /\.m3u8(\?|$)/i.test(url) };
      } catch {
        return null;
      }
    },
    [activeProfile?.id],
  );

  return (
    <TitleDetailPage
      detail={detail}
      onBack={onBack}
      onPlay={(episodeId) => onPlay(episodeId)}
      resolveEpisodeStream={resolveEpisodeStream}
      isInMyList={isInMyList}
      onToggleMyList={() => void handleToggleMyList()}
      myListLoading={myListLoading}
      secondaryPlayAction={
        firstEpisode && hasInProgressResume
          ? {
              label: "Dal primo episodio",
              episodeId: firstEpisode.id,
              episodeTitle: firstEpisode.title,
            }
          : undefined
      }
      extraHeroActions={
        isParent ? (
          <button
            type="button"
            onClick={() => onAddEpisode(series)}
            className="inline-flex items-center gap-2 rounded-md border-2 border-white/25 px-5 py-3 text-[14px] font-medium text-white transition-colors hover:border-white/45"
          >
            <Plus className="h-4 w-4" />
            Aggiungi episodio
          </button>
        ) : undefined
      }
      renderEpisodeExtra={(episode) =>
        isParent ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(episode.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
              title="Modifica"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Eliminare questo episodio dalla libreria?",
                  )
                ) {
                  return;
                }
                await onDelete(episode.id);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-warm/10 hover:text-warm"
              title="Elimina"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null
      }
    />
  );
}
