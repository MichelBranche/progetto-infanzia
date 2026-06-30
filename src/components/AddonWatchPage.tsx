import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchAddonMeta,
  fetchScMeta,
  fetchSaturnMeta,
  getStreamingWatchProgress,
  resolveAddonStreams,
  resolveScStream,
  resolveSaturnStream,
  resolveScPreview,
  resolveTorrentSource,
} from "../lib/addonsApi";
import { metaToMediaItem } from "../lib/streamingBrowse";
import type { AddonWatchTarget } from "../lib/streamingBrowse";
import { STREMIO_ADDONS_ENABLED, isBuiltinStreamingCatalog } from "../lib/features";
import { streamingListKey } from "../lib/myList";
import { useMyList } from "../lib/useMyList";
import type { PlayableStream, StremioMeta, StremioMetaPreview } from "../types/stremio";
import type { WatchPartySession } from "../types/watchParty";
import { VideoPlayer } from "./VideoPlayer";
import { StreamingTitlePage } from "./StreamingTitlePage";

interface AddonWatchPageProps extends AddonWatchTarget {
  profileId: string;
  onBack: () => void;
  watchPartySession?: WatchPartySession | null;
  onWatchPartySessionChange?: (session: WatchPartySession | null) => void;
}

function StreamPickModal({
  streamPick,
  resolving,
  error,
  onPick,
  onClose,
}: {
  streamPick: {
    videoId: string;
    videoTitle: string;
    streams: PlayableStream[];
  };
  resolving: boolean;
  error: string | null;
  onPick: (stream: PlayableStream) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-void p-5">
        <h3 className="text-[15px] font-medium text-text-primary">Scegli qualità</h3>
        {resolving && (
          <p className="mt-2 flex items-center gap-2 text-[12px] text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Avvio del torrent… (ricerca peer)
          </p>
        )}
        {error && <p className="mt-2 text-[12px] text-red-400/90">{error}</p>}
        <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
          {streamPick.streams.map((s, i) => (
            <li key={`${s.url || s.infoHash}-${i}`}>
              <button
                type="button"
                disabled={resolving}
                onClick={() => onPick(s)}
                className="w-full rounded-xl border border-white/[0.08] px-3 py-2.5 text-left text-[13px] hover:border-accent/30 disabled:opacity-50"
              >
                {s.name || s.description || `Stream ${i + 1}`}
                <span className="mt-0.5 block text-[11px] text-text-muted">
                  {s.addonName}
                  {s.needsDebrid ? " · Torrent" : s.isHls ? " · HLS" : " · Diretto"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-white/10 py-2 text-[12px] text-text-muted"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

export function AddonWatchPage({
  profileId,
  contentType,
  metaId,
  videoId: initialVideoId,
  slug,
  catalogPrefix,
  onBack,
  watchPartySession,
  onWatchPartySessionChange,
}: AddonWatchPageProps) {
  const isSc = catalogPrefix === "sc" && !!slug;
  const isSaturn = catalogPrefix === "saturn" && !!slug;
  const isBuiltin = isSc || isSaturn;
  const [meta, setMeta] = useState<StremioMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamPick, setStreamPick] = useState<{
    videoId: string;
    videoTitle: string;
    streams: PlayableStream[];
  } | null>(null);
  const [playback, setPlayback] = useState<{
    stream: PlayableStream;
    videoId: string;
    videoTitle: string;
    watchPosition?: number;
    watchDuration?: number;
  } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [myListLoading, setMyListLoading] = useState(false);
  const { streamingListKeys, toggleStreaming } = useMyList(profileId);

  const listPreview = useMemo((): StremioMetaPreview | null => {
    if (!meta) return null;
    return {
      id: metaId,
      type: contentType,
      name: meta.name,
      poster: meta.poster,
      description: meta.description,
      releaseInfo: meta.releaseInfo,
      catalogPrefix: catalogPrefix ?? "sc",
      slug,
    };
  }, [meta, metaId, contentType, catalogPrefix, slug]);

  const isInMyList = listPreview
    ? streamingListKeys.has(streamingListKey(listPreview))
    : false;

  const handleToggleMyList = useCallback(async () => {
    if (!listPreview) return;
    setMyListLoading(true);
    try {
      await toggleStreaming(listPreview);
    } finally {
      setMyListLoading(false);
    }
  }, [listPreview, toggleStreaming]);

  const resolveEpisodeStream = useCallback(
    async (videoId: string) => {
      if (!isBuiltin || !slug) return null;
      try {
        const stream = isSc
          ? await resolveScStream(metaId, slug, videoId)
          : await resolveSaturnStream(slug, videoId);
        return { url: stream.url, isHls: stream.isHls };
      } catch {
        return null;
      }
    },
    [isBuiltin, isSc, metaId, slug],
  );

  const playStream = useCallback(
    async (stream: PlayableStream, videoId: string, videoTitle: string) => {
      const loadProgress = async () => {
        if (!isBuiltin || !slug) {
          return { watchPosition: undefined, watchDuration: undefined };
        }
        try {
          const progress = await getStreamingWatchProgress(
            profileId,
            catalogPrefix ?? "sc",
            contentType,
            metaId,
            slug,
            videoId,
          );
          if (!progress) return { watchPosition: undefined, watchDuration: undefined };
          return {
            watchPosition: progress[0],
            watchDuration: progress[1] ?? undefined,
          };
        } catch {
          return { watchPosition: undefined, watchDuration: undefined };
        }
      };

      if (!stream.needsDebrid) {
        const resume =
          watchPartySession?.role === "guest"
            ? {
                watchPosition: watchPartySession.room.positionSecs,
                watchDuration: undefined,
              }
            : await loadProgress();
        setPlayback({ stream, videoId, videoTitle, ...resume });
        setStreamPick(null);
        return;
      }
      setResolving(true);
      setError(null);
      try {
        const resolved = await resolveTorrentSource(
          profileId,
          stream.infoHash ?? "",
          stream.fileIdx,
          stream.sources ?? [],
        );
        const resume =
          watchPartySession?.role === "guest"
            ? {
                watchPosition: watchPartySession.room.positionSecs,
                watchDuration: undefined,
              }
            : await loadProgress();
        setPlayback({ stream: resolved, videoId, videoTitle, ...resume });
        setStreamPick(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setResolving(false);
      }
    },
    [profileId, isBuiltin, catalogPrefix, slug, contentType, metaId, watchPartySession],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = isSc
          ? await fetchScMeta(metaId, slug!)
          : isSaturn
            ? await fetchSaturnMeta(slug!)
            : await fetchAddonMeta(profileId, contentType, metaId);
        if (!cancelled) setMeta(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, contentType, metaId, isSc, isSaturn, slug]);

  const startPlayback = useCallback(
    async (videoId: string, videoTitle: string) => {
      if (!meta) return;
      setStreamsLoading(true);
      setStreamPick(null);
      setError(null);
      try {
        const streams = isSc
          ? [await resolveScStream(metaId, slug!, videoId)]
          : isSaturn
            ? [await resolveSaturnStream(slug!, videoId)]
            : await resolveAddonStreams(profileId, meta.type, videoId);
        if (streams.length === 0) {
          setError(
            "Nessuno stream riproducibile in app. Installa un addon con risorsa «stream» (URL HTTP/HLS).",
          );
          return;
        }
        if (streams.length === 1) {
          await playStream(streams[0], videoId, videoTitle);
        } else {
          setStreamPick({ videoId, videoTitle, streams });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStreamsLoading(false);
      }
    },
    [meta, profileId, playStream, isSc, isSaturn, metaId, slug],
  );

  const startPreview = useCallback(async () => {
    if (!meta || !isSc || !slug) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const stream = await resolveScPreview(metaId, slug);
      if (!stream) {
        setError("Trailer non disponibile per questo titolo.");
        return;
      }
      const trailerVideoId = meta.videos[0]?.id ?? metaId;
      await playStream(stream, trailerVideoId, `${meta.name} · Trailer`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [meta, isSc, slug, metaId, playStream]);

  useEffect(() => {
    if (!meta || !initialVideoId || loading) return;
    void startPlayback(initialVideoId, meta.name);
  }, [meta, initialVideoId, loading, startPlayback]);

  if (!STREMIO_ADDONS_ENABLED && !isBuiltinStreamingCatalog(catalogPrefix)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-void px-8 text-center">
        <p className="max-w-md text-[15px] text-text-secondary">
          Gli addon Stremio sono disattivati. Usa i titoli Streaming Community
          dalla Home.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/15 px-4 py-2 text-[13px]"
        >
          Indietro
        </button>
      </div>
    );
  }

  if (playback && meta) {
    const playbackMedia = metaToMediaItem(meta, playback.videoTitle);
    if (playback.watchPosition != null) {
      playbackMedia.watchPosition = playback.watchPosition;
    }
    if (playback.watchDuration != null) {
      playbackMedia.watchDuration = playback.watchDuration;
    }
    const episodeLabel =
      playback.videoTitle !== meta.name ? playback.videoTitle : undefined;

    return (
      <VideoPlayer
        streamUrl={playback.stream.url}
        isHls={playback.stream.isHls}
        remotePlayback={{
          contentType: meta.type,
          videoId: playback.videoId,
          catalogPrefix: isBuiltin ? catalogPrefix : undefined,
          titleId: metaId,
          slug: slug ?? undefined,
          titleName: meta.name,
          episodeLabel,
          poster: meta.poster,
        }}
        media={playbackMedia}
        watchPartySession={watchPartySession}
        onWatchPartySessionChange={onWatchPartySessionChange}
        onBack={() => {
          if (watchPartySession) {
            onWatchPartySessionChange?.(null);
            onBack();
            return;
          }
          setPlayback(null);
          if (initialVideoId) onBack();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-void">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-void px-8">
        <p className="max-w-md text-center text-[15px] text-red-300">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/15 px-4 py-2 text-[13px]"
        >
          Indietro
        </button>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <>
      <StreamingTitlePage
        meta={meta}
        loading={streamsLoading || resolving}
        error={error}
        onBack={onBack}
        onPlay={(videoId, videoTitle) => void startPlayback(videoId, videoTitle)}
        onPlayPreview={
          isSc && meta.hasPreview ? () => void startPreview() : undefined
        }
        previewLoading={previewLoading}
        isInMyList={isInMyList}
        onToggleMyList={() => void handleToggleMyList()}
        myListLoading={myListLoading}
        resolveEpisodeStream={isBuiltin ? resolveEpisodeStream : undefined}
      />
      {streamPick && (
        <StreamPickModal
          streamPick={streamPick}
          resolving={resolving}
          error={error}
          onPick={(s) =>
            void playStream(s, streamPick.videoId, streamPick.videoTitle)
          }
          onClose={() => setStreamPick(null)}
        />
      )}
    </>
  );
}
