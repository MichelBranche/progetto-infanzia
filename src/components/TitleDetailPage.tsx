import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Loader2,
  Play,
  Plus,
  Star,
} from "lucide-react";
import type {
  TitleDetailEpisode,
  TitleDetailModel,
} from "../lib/titleDetail";
import {
  episodesForSeason,
  seasonsFromEpisodes,
  sortedEpisodes,
} from "../lib/titleDetail";
import { EpisodeThumbnail } from "./EpisodeThumbnail";
import { LordFlixTrailerCard } from "./LordFlixTrailerCard";
import { SparkleActionButton } from "./SparkleActionButton";
import { fetchCastPhotos } from "../lib/castPhotos";

export interface TitleDetailPageProps {
  detail: TitleDetailModel;
  loading?: boolean;
  error?: string | null;
  onBack: () => void;
  onPlay: (episodeId: string, episodeTitle: string) => void;
  onPlayPreview?: () => void;
  previewLoading?: boolean;
  extraHeroActions?: ReactNode;
  renderEpisodeExtra?: (episode: TitleDetailEpisode) => ReactNode;
  secondaryPlayAction?: {
    label: string;
    episodeId: string;
    episodeTitle: string;
  };
  isInMyList?: boolean;
  onToggleMyList?: () => void;
  myListLoading?: boolean;
  resolveEpisodeStream?: (
    episodeId: string,
  ) => Promise<{ url: string; isHls: boolean } | null>;
  seasonNumbers?: number[];
  onLoadSeason?: (season: number) => Promise<TitleDetailEpisode[] | void>;
  footer?: ReactNode;
}

function parseGenreBullets(genreLine?: string): string[] {
  if (!genreLine?.trim()) return [];
  return genreLine
    .split(/[,/|•]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCastMembers(castLine?: string) {
  if (!castLine?.trim()) return [];
  return castLine
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 14)
    .map((name) => ({
      name,
      initial: name.charAt(0).toUpperCase() || "?",
    }));
}

function runtimeEndLabel(runtime?: string): string | null {
  if (!runtime?.trim()) return null;
  const hoursMin = runtime.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/i);
  const minsOnly = runtime.match(/(\d+)\s*min/i);
  let totalMin = 0;
  if (hoursMin) {
    totalMin = Number.parseInt(hoursMin[1], 10) * 60;
    if (hoursMin[2]) totalMin += Number.parseInt(hoursMin[2], 10);
  } else if (minsOnly) {
    totalMin = Number.parseInt(minsOnly[1], 10);
  } else {
    return null;
  }
  const end = new Date(Date.now() + totalMin * 60_000);
  return end.toLocaleTimeString("it-IT", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function CircleActionButton({
  label,
  children,
  onClick,
  disabled,
  checked = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  checked?: boolean;
}) {
  return (
    <SparkleActionButton
      sparkle="list"
      checked={checked}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="lf-title-detail__circle-btn"
    >
      {children}
    </SparkleActionButton>
  );
}

function TitleDetailInfoSidebar({ detail }: { detail: TitleDetailModel }) {
  const endLabel = runtimeEndLabel(detail.runtime);
  const rows = [
    detail.runtime
      ? {
          label: "Durata",
          value: endLabel
            ? `${detail.runtime} · finisce alle ${endLabel}`
            : detail.runtime,
        }
      : null,
    detail.year ? { label: "Uscita", value: detail.year } : null,
    detail.quality ? { label: "Qualità", value: detail.quality } : null,
    detail.views ? { label: "Visualizzazioni", value: detail.views } : null,
    detail.typeLabel ? { label: "Tipo", value: detail.typeLabel } : null,
    detail.isSeries && detail.episodes.length > 0
      ? {
          label: "Episodi",
          value: String(detail.episodes.length),
        }
      : null,
  ].filter((row): row is { label: string; value: string } => row != null);

  if (rows.length === 0) return null;

  return (
    <aside className="lf-title-detail__sidebar" aria-label="Informazioni titolo">
      {rows.map((row) => (
        <div key={row.label} className="lf-title-detail__sidebar-row">
          <span className="lf-title-detail__sidebar-label">{row.label}</span>
          <span className="lf-title-detail__sidebar-value">{row.value}</span>
        </div>
      ))}
    </aside>
  );
}

function TitleDetailCastRow({
  castLine,
  title,
  year,
  isSeries,
  tmdbId,
  tmdbType,
}: {
  castLine?: string;
  title: string;
  year?: string;
  isSeries: boolean;
  tmdbId?: number;
  tmdbType?: string;
}) {
  const members = useMemo(() => parseCastMembers(castLine), [castLine]);
  const [photoByName, setPhotoByName] = useState<Record<string, string>>({});

  useEffect(() => {
    if (members.length === 0) return;
    let cancelled = false;

    void fetchCastPhotos({
      title,
      year: year ? Number.parseInt(year, 10) : undefined,
      isSeries,
      tmdbId,
      tmdbType,
      castNames: members.map((member) => member.name),
    }).then((photos) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const photo of photos) {
        if (photo.photoUrl) next[photo.name] = photo.photoUrl;
      }
      setPhotoByName(next);
    });

    return () => {
      cancelled = true;
    };
  }, [members, title, year, isSeries, tmdbId, tmdbType]);

  if (members.length === 0) return null;

  return (
    <section className="lf-title-detail__section">
      <h2 className="lf-title-detail__section-title">Cast</h2>
      <div className="lf-title-detail__cast-scroll scrollbar-hide">
        {members.map((member) => {
          const photoUrl = photoByName[member.name];
          return (
            <div key={member.name} className="lf-title-detail__cast-member">
              <div className="lf-title-detail__cast-avatar" aria-hidden>
                {photoUrl ? (
                  <img
                    className="lf-title-detail__cast-photo"
                    src={photoUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  member.initial
                )}
              </div>
              <p className="lf-title-detail__cast-name">{member.name}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SeasonPills({
  seasons,
  activeSeason,
  onChange,
}: {
  seasons: number[];
  activeSeason: number;
  onChange: (season: number) => void;
}) {
  if (seasons.length <= 1) return null;

  return (
    <div className="lf-title-detail__seasons scrollbar-hide" role="tablist">
      {seasons.map((season) => {
        const active = season === activeSeason;
        return (
          <button
            key={season}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(season)}
            className={`lf-title-detail__season-pill${
              active ? " lf-title-detail__season-pill--active" : ""
            }`}
          >
            Stagione {season}
          </button>
        );
      })}
    </div>
  );
}

function mergeEpisodesById(
  episodes: TitleDetailEpisode[],
): TitleDetailEpisode[] {
  const byId = new Map<string, TitleDetailEpisode>();
  for (const ep of episodes) {
    byId.set(ep.id, ep);
  }
  return sortedEpisodes([...byId.values()]);
}

function useSeasonSelection(
  detail: TitleDetailModel,
  seasonNumbers?: number[],
  onLoadSeason?: (season: number) => Promise<TitleDetailEpisode[] | void>,
) {
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonLoadError, setSeasonLoadError] = useState<string | null>(null);
  const allEpisodes = useMemo(
    () => mergeEpisodesById(detail.episodes),
    [detail.episodes],
  );
  const episodesKey = useMemo(
    () =>
      allEpisodes
        .map((ep) => `${ep.id}:${ep.season ?? ""}:${ep.episode ?? ""}`)
        .join("|"),
    [allEpisodes],
  );
  const seasons = useMemo(
    () => seasonsFromEpisodes(allEpisodes, seasonNumbers),
    [episodesKey, allEpisodes, seasonNumbers],
  );
  const seasonsKey = seasons.join(",");
  const [activeSeason, setActiveSeason] = useState(seasons[0] ?? 1);

  useEffect(() => {
    setSeasonLoadError(null);
    setActiveSeason(seasons[0] ?? 1);
  }, [detail.id, seasonsKey]);

  useEffect(() => {
    if (!seasons.includes(activeSeason)) {
      setActiveSeason(seasons[0] ?? 1);
    }
  }, [seasons, seasonsKey, activeSeason]);

  const handleSeasonChange = useCallback(
    (season: number) => {
      setActiveSeason(season);
      setSeasonLoadError(null);
      if (!onLoadSeason) return;
      if (episodesForSeason(detail.episodes, season).length > 0) return;
      setSeasonLoading(true);
      void onLoadSeason(season)
        .then((eps) => {
          if (!eps?.length) {
            setSeasonLoadError(
              `Nessun episodio trovato per la stagione ${season}. Riprova tra poco.`,
            );
          }
        })
        .catch(() => {
          setSeasonLoadError(
            `Impossibile caricare la stagione ${season}. Controlla la connessione e riprova.`,
          );
        })
        .finally(() => setSeasonLoading(false));
    },
    [onLoadSeason, detail.episodes],
  );

  const filteredEpisodes = useMemo(() => {
    if (!detail.isSeries || seasons.length <= 1) {
      return allEpisodes;
    }
    return episodesForSeason(allEpisodes, activeSeason);
  }, [allEpisodes, detail.isSeries, seasons, activeSeason]);

  const primaryEpisodeInSeason = useMemo(() => {
    if (detail.preferredEpisodeId) {
      const preferred = filteredEpisodes.find(
        (ep) => ep.id === detail.preferredEpisodeId,
      );
      if (preferred) return preferred;
    }
    const resume = filteredEpisodes.find((ep) => (ep.progressPercent ?? 0) > 2);
    if (resume) return resume;
    if (detail.primaryEpisodeId) {
      const preferred = filteredEpisodes.find(
        (ep) => ep.id === detail.primaryEpisodeId,
      );
      if (preferred) return preferred;
    }
    return filteredEpisodes[0];
  }, [filteredEpisodes, detail.primaryEpisodeId, detail.preferredEpisodeId]);

  return {
    seasons,
    activeSeason,
    setActiveSeason: handleSeasonChange,
    filteredEpisodes,
    primaryEpisodeInSeason,
    showSeasonPicker: detail.isSeries && seasons.length > 1,
    seasonLoading,
    seasonLoadError,
  };
}

function EpisodeList({
  loading,
  onPlay,
  renderEpisodeExtra,
  seasons,
  activeSeason,
  onSeasonChange,
  filteredEpisodes,
  showSeasonPicker,
  resolveEpisodeStream,
  seasonLoading = false,
  seasonLoadError = null,
}: {
  loading: boolean;
  onPlay: (episodeId: string, episodeTitle: string) => void;
  renderEpisodeExtra?: (episode: TitleDetailEpisode) => ReactNode;
  seasons: number[];
  activeSeason: number;
  onSeasonChange: (season: number) => void;
  filteredEpisodes: TitleDetailEpisode[];
  showSeasonPicker: boolean;
  resolveEpisodeStream?: (
    episodeId: string,
  ) => Promise<{ url: string; isHls: boolean } | null>;
  seasonLoading?: boolean;
  seasonLoadError?: string | null;
}) {
  return (
    <div>
      {showSeasonPicker && (
        <SeasonPills
          seasons={seasons}
          activeSeason={activeSeason}
          onChange={onSeasonChange}
        />
      )}

      {(loading || seasonLoading) && filteredEpisodes.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : seasonLoadError && filteredEpisodes.length === 0 ? (
        <p className="lf-title-detail__empty">{seasonLoadError}</p>
      ) : (
        <div className="lf-title-detail__episodes">
          {filteredEpisodes.map((episode, index) => (
            <motion.article
              key={episode.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="lf-title-detail__episode"
            >
              <button
                type="button"
                disabled={loading}
                onClick={() => onPlay(episode.id, episode.title)}
                className="lf-title-detail__episode-thumb"
              >
                <EpisodeThumbnail
                  episode={episode}
                  index={index}
                  resolveEpisodeStream={resolveEpisodeStream}
                />
                <div className="lf-title-detail__episode-play">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-void" />
                  ) : (
                    <Play className="h-4 w-4 fill-void text-void" />
                  )}
                </div>
                {(episode.progressPercent ?? 0) > 1 && (
                  <div className="lf-title-detail__episode-progress">
                    <div
                      style={{ width: `${episode.progressPercent}%` }}
                    />
                  </div>
                )}
              </button>

              <div className="lf-title-detail__episode-body">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onPlay(episode.id, episode.title)}
                  className="min-w-0 flex-1 text-left"
                >
                  <h3 className="lf-title-detail__episode-title">
                    {episode.title}
                  </h3>
                  <p className="lf-title-detail__episode-meta">
                    {episode.code ?? `Episodio ${index + 1}`}
                    {episode.runtime ? ` · ${episode.runtime}` : ""}
                  </p>
                  {episode.description && (
                    <p className="lf-title-detail__episode-desc">
                      {episode.description}
                    </p>
                  )}
                </button>
                {renderEpisodeExtra?.(episode)}
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}

export function TitleDetailPage({
  detail,
  loading = false,
  error,
  onBack,
  onPlay,
  onPlayPreview,
  previewLoading = false,
  extraHeroActions,
  renderEpisodeExtra,
  secondaryPlayAction,
  isInMyList = false,
  onToggleMyList,
  myListLoading = false,
  resolveEpisodeStream,
  seasonNumbers,
  onLoadSeason,
  footer,
}: TitleDetailPageProps) {
  const [expandedPlot, setExpandedPlot] = useState(false);
  const {
    seasons,
    activeSeason,
    setActiveSeason,
    filteredEpisodes,
    primaryEpisodeInSeason,
    showSeasonPicker,
    seasonLoading,
    seasonLoadError,
  } = useSeasonSelection(detail, seasonNumbers, onLoadSeason);

  const genres = useMemo(
    () => parseGenreBullets(detail.genreLine),
    [detail.genreLine],
  );

  const primaryEpisodeId =
    primaryEpisodeInSeason?.id ??
    detail.primaryEpisodeId ??
    detail.episodes[0]?.id;
  const primaryEpisode = detail.episodes.find(
    (ep) => ep.id === primaryEpisodeId,
  );
  const plot = detail.description?.trim();
  const plotLong = (plot?.length ?? 0) > 180;
  const playLabel = detail.playLabel ?? "Riproduci";
  const showEpisodeList =
    detail.isSeries && detail.episodes.length > 0;
  const showNoEpisodes =
    detail.isSeries && detail.episodes.length === 0;

  const playPrimary = () => {
    if (!primaryEpisodeId) return;
    const episodeTitle = primaryEpisode?.title?.trim() || detail.name;
    onPlay(primaryEpisodeId, episodeTitle);
  };

  return (
    <div className="lf-title-detail min-h-full bg-void pb-20">
      <section className="lf-title-detail__hero relative w-full overflow-hidden">
        {detail.heroImage ? (
          <img
            src={detail.heroImage}
            alt=""
            className="lf-title-detail__hero-bg"
          />
        ) : (
          <div className="lf-title-detail__hero-bg lf-title-detail__hero-bg--fallback" />
        )}
        <div className="lf-title-detail__hero-scrim" aria-hidden />

        <button
          type="button"
          onClick={onBack}
          className="lf-title-detail__back"
          aria-label="Indietro"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>

        <div className="lf-title-detail__hero-inner page-px">
          <div className="lf-title-detail__hero-grid">
            <div className="lf-title-detail__hero-main">
              {detail.logo ? (
                <img
                  src={detail.logo}
                  alt={detail.name}
                  className="lf-title-detail__logo"
                />
              ) : (
                <h1 className="lf-title-detail__title">{detail.name}</h1>
              )}

              {genres.length > 0 && (
                <p className="lf-title-detail__genres">
                  {genres.join(" · ")}
                </p>
              )}

              <div className="lf-title-detail__actions">
                <button
                  type="button"
                  disabled={loading || !primaryEpisodeId}
                  onClick={playPrimary}
                  className="lf-title-detail__play-btn"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Play className="h-5 w-5 fill-black" />
                  )}
                  {playLabel}
                </button>

                <CircleActionButton
                  label={isInMyList ? "Rimuovi dalla mia lista" : "La mia lista"}
                  onClick={onToggleMyList}
                  disabled={!onToggleMyList || myListLoading}
                  checked={isInMyList}
                >
                  {myListLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isInMyList ? (
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  ) : (
                    <Plus className="h-5 w-5" strokeWidth={2} />
                  )}
                </CircleActionButton>

                {secondaryPlayAction && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      onPlay(
                        secondaryPlayAction.episodeId,
                        secondaryPlayAction.episodeTitle,
                      )
                    }
                    className="lf-title-detail__secondary-btn"
                  >
                    {secondaryPlayAction.label}
                  </button>
                )}

                {extraHeroActions}
              </div>

              <div className="lf-title-detail__meta-row">
                {detail.year && <span>{detail.year}</span>}
                {detail.runtime && (
                  <>
                    {detail.year && <span className="lf-title-detail__dot">·</span>}
                    <span>{detail.runtime}</span>
                  </>
                )}
                {detail.views && (
                  <>
                    {(detail.year || detail.runtime) && (
                      <span className="lf-title-detail__dot">·</span>
                    )}
                    <span>{detail.views}</span>
                  </>
                )}
                {detail.quality && (
                  <span className="lf-title-detail__badge">{detail.quality}</span>
                )}
                {detail.rating && (
                  <span className="lf-title-detail__rating">
                    <Star className="h-3.5 w-3.5 fill-white/25 text-white/90" />
                    {detail.rating}
                  </span>
                )}
              </div>

              {detail.directorsLine && (
                <p className="lf-title-detail__director">
                  <span>Regia:</span> {detail.directorsLine}
                </p>
              )}

              {plot && (
                <div className="lf-title-detail__synopsis">
                  <p className={expandedPlot ? "" : "line-clamp-2"}>{plot}</p>
                  {plotLong && (
                    <button
                      type="button"
                      onClick={() => setExpandedPlot((value) => !value)}
                      className="lf-title-detail__read-more"
                    >
                      {expandedPlot ? "Mostra meno" : "Leggi tutto"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <TitleDetailInfoSidebar detail={detail} />
          </div>
        </div>
      </section>

      {error && (
        <p className="page-px mt-4 text-[13px] text-red-400/90">{error}</p>
      )}

      <div className="lf-title-detail__body page-px">
        <TitleDetailCastRow
          castLine={detail.castLine}
          title={detail.name}
          year={detail.year}
          isSeries={detail.isSeries}
          tmdbId={detail.tmdbId}
          tmdbType={detail.tmdbType}
        />

        {detail.hasPreview && onPlayPreview && (
          <section className="lf-title-detail__section">
            <h2 className="lf-title-detail__section-title">Trailer</h2>
            <div className="lf-title-detail__trailer">
              <LordFlixTrailerCard
                thumbnailUrl={detail.heroImage}
                title={`Trailer · ${detail.name}`}
                badge="Trailer ufficiale"
                disabled={previewLoading}
                onClick={onPlayPreview}
                className="lf-trailer-card--detail"
              />
            </div>
          </section>
        )}

        {showEpisodeList ? (
          <section className="lf-title-detail__section">
            <h2 className="lf-title-detail__section-title">Episodi</h2>
            {showSeasonPicker && (
              <p className="lf-title-detail__section-sub">
                {seasons.length} stagion{seasons.length === 1 ? "e" : "i"} ·{" "}
                {filteredEpisodes.length} episod
                {filteredEpisodes.length === 1 ? "io" : "i"}
              </p>
            )}
            <EpisodeList
              loading={loading}
              onPlay={onPlay}
              renderEpisodeExtra={renderEpisodeExtra}
              seasons={seasons}
              activeSeason={activeSeason}
              onSeasonChange={setActiveSeason}
              filteredEpisodes={filteredEpisodes}
              showSeasonPicker={showSeasonPicker}
              resolveEpisodeStream={resolveEpisodeStream}
              seasonLoading={seasonLoading}
              seasonLoadError={seasonLoadError}
            />
          </section>
        ) : showNoEpisodes ? (
          <section className="lf-title-detail__section">
            <div className="lf-title-detail__empty">
              <h2 className="lf-title-detail__section-title">
                Nessun episodio disponibile
              </h2>
              <p className="mt-2 text-[14px] text-text-secondary">
                Questo titolo non ha ancora episodi pubblicati, oppure la
                versione selezionata non è quella corretta.
              </p>
            </div>
          </section>
        ) : !plot ? (
          <section className="lf-title-detail__section">
            <p className="lf-title-detail__empty">
              Nessuna descrizione disponibile per questo titolo.
            </p>
          </section>
        ) : null}

        {footer}
      </div>
    </div>
  );
}
