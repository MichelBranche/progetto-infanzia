import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Loader2,
  Play,
  Plus,
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
type DetailTab = "overview" | "details" | "trailer";

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

function RatingBadge({ rating }: { rating: string }) {
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-mint/70 text-[13px] font-semibold text-white"
      title={`Valutazione ${rating}`}
    >
      {rating}
    </div>
  );
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
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/25 bg-black/35 text-white backdrop-blur-sm transition-colors hover:border-white/45 hover:bg-black/50 disabled:opacity-50"
    >
      {children}
    </SparkleActionButton>
  );
}

function DetailTabs({
  active,
  onChange,
  showTrailer,
}: {
  active: DetailTab;
  onChange: (tab: DetailTab) => void;
  showTrailer: boolean;
}) {
  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Panoramica" },
    { id: "details", label: "Dettagli" },
  ];
  if (showTrailer) {
    tabs.push({ id: "trailer", label: "Trailer" });
  }

  return (
    <nav className="flex gap-6 border-t border-white/10 sm:gap-10">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`relative py-3 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors sm:text-[12px] ${
            active === tab.id
              ? "text-white"
              : "text-white/45 hover:text-white/70"
          }`}
        >
          {tab.label}
          {active === tab.id && (
            <motion.span
              layoutId="title-detail-tab"
              className="absolute inset-x-0 bottom-0 h-[2px] bg-mint"
            />
          )}
        </button>
      ))}
    </nav>
  );
}

function SeasonSelector({
  seasons,
  activeSeason,
  onChange,
  className = "",
}: {
  seasons: number[];
  activeSeason: number;
  onChange: (season: number) => void;
  className?: string;
}) {
  if (seasons.length <= 1) return null;

  return (
    <div className={className}>
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
        Stagione
      </label>
      <select
        value={activeSeason}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full max-w-xs rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-[14px] text-white outline-none transition-colors focus:border-white/35 sm:w-auto sm:min-w-[180px]"
      >
        {seasons.map((season) => (
          <option key={season} value={season} className="bg-void text-white">
            Stagione {season}
          </option>
        ))}
      </select>
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
        <SeasonSelector
          seasons={seasons}
          activeSeason={activeSeason}
          onChange={onSeasonChange}
          className="mb-5"
        />
      )}

      {(loading || seasonLoading) && filteredEpisodes.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : seasonLoadError && filteredEpisodes.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-[14px] text-text-secondary">
          {seasonLoadError}
        </p>
      ) : (
      <div className="grid gap-3">
        {filteredEpisodes.map((episode, index) => (          <motion.article
            key={episode.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="group flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
          >
            <button
              type="button"
              disabled={loading}
              onClick={() => onPlay(episode.id, episode.title)}
              className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-black/40 sm:w-48"
            >
              <EpisodeThumbnail
                episode={episode}
                index={index}
                resolveEpisodeStream={resolveEpisodeStream}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-void" />
                  ) : (
                    <Play className="h-4 w-4 fill-void text-void" />
                  )}
                </div>
              </div>
              {(episode.progressPercent ?? 0) > 1 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${episode.progressPercent}%` }}
                  />
                </div>
              )}
            </button>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onPlay(episode.id, episode.title)}
                  className="min-w-0 text-left"
                >
                  <h3 className="truncate text-[15px] font-medium text-text-primary group-hover:text-white">
                    {episode.title}
                  </h3>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                    {episode.code ?? `Episodio ${index + 1}`}
                    {episode.runtime ? ` · ${episode.runtime}` : ""}
                  </p>
                  {(episode.progressPercent ?? 0) > 1 && (
                    <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-accent transition-[width]"
                        style={{ width: `${episode.progressPercent}%` }}
                      />
                    </div>
                  )}
                  {episode.description && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-text-secondary">
                      {episode.description}
                    </p>
                  )}
                </button>
                {renderEpisodeExtra?.(episode)}
              </div>
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
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
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

  const primaryEpisodeId =
    primaryEpisodeInSeason?.id ??
    detail.primaryEpisodeId ??
    detail.episodes[0]?.id;
  const primaryEpisode = detail.episodes.find(
    (ep) => ep.id === primaryEpisodeId,
  );  const plot = detail.description?.trim();
  const plotLong = (plot?.length ?? 0) > 220;
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

  const detailFields = [
    ["Titolo", detail.name],
    ["Tipo", detail.typeLabel],
    ["Anno", detail.year],
    ["Durata", detail.runtime],
    ["Valutazione", detail.rating],
    ["Qualità", detail.quality],
    ["Visualizzazioni", detail.views],
    ["Genere", detail.genreLine],
    ["Cast", detail.castLine],
    ["Regia", detail.directorsLine],
    [
      "Episodi",
      detail.isSeries ? String(detail.episodes.length) : null,
    ],
  ] as const;

  return (
    <div className="min-h-full bg-void pb-16">
      <div className="relative min-h-[72vh] w-full overflow-hidden">
        {detail.heroImage ? (
          <img
            src={detail.heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/75 to-void/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-void/95 via-void/50 to-transparent" />

        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-24 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60 sm:left-8 sm:top-28 lg:left-12"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="page-px relative flex min-h-[72vh] flex-col justify-end">
          <div className="max-w-3xl pb-5 pt-28 sm:pb-6">
            {detail.logo ? (
              <img
                src={detail.logo}
                alt={detail.name}
                className="mb-4 max-h-24 w-auto max-w-[min(100%,420px)] object-contain object-left drop-shadow-[0_8px_32px_rgba(0,0,0,0.55)] sm:max-h-28"
              />
            ) : (
              <>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-mint">
                  {detail.typeLabel}
                </p>
                <h1 className="font-display mb-4 max-w-2xl text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                  {detail.name}
                </h1>
              </>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/75 sm:text-[14px]">
              {detail.year && <span>{detail.year}</span>}
              {detail.runtime && (
                <>
                  {detail.year && <span className="text-white/35">·</span>}
                  <span>{detail.runtime}</span>
                </>
              )}
              {detail.views && (
                <>
                  {(detail.year || detail.runtime) && (
                    <span className="text-white/35">·</span>
                  )}
                  <span>{detail.views}</span>
                </>
              )}
              {detail.isSeries && detail.episodes.length > 0 && (
                <>
                  {(detail.year || detail.runtime || detail.views) && (
                    <span className="text-white/35">·</span>
                  )}
                  <span>
                    {showSeasonPicker
                      ? `${seasons.length} stagion${seasons.length === 1 ? "e" : "i"}`
                      : null}
                    {showSeasonPicker && filteredEpisodes.length > 0 && " · "}
                    {showSeasonPicker
                      ? `${filteredEpisodes.length} episod${filteredEpisodes.length === 1 ? "io" : "i"}`
                      : `${detail.episodes.length} episod${detail.episodes.length === 1 ? "io" : "i"}`}
                  </span>
                </>
              )}
              {detail.quality && (
                <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90">
                  {detail.quality}
                </span>
              )}
            </div>

            {showSeasonPicker && (
              <SeasonSelector
                seasons={seasons}
                activeSeason={activeSeason}
                onChange={setActiveSeason}
                className="mt-5"
              />
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">              <button
                type="button"
                disabled={loading || !primaryEpisodeId}
                onClick={playPrimary}
                className="inline-flex min-w-[148px] items-center justify-center gap-2.5 rounded-md bg-white px-6 py-3 text-[15px] font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-black" />
                )}
                {playLabel}
              </button>

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
                  className="inline-flex items-center gap-2 rounded-md border-2 border-white/25 px-5 py-3 text-[14px] font-medium text-white transition-colors hover:border-white/45 disabled:opacity-60"
                >
                  {secondaryPlayAction.label}
                </button>
              )}

              {extraHeroActions}

              {detail.rating && <RatingBadge rating={detail.rating} />}

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
            </div>

            {plot && (
              <div className="mt-5 max-w-2xl">
                <p
                  className={`text-[14px] leading-relaxed text-white/75 sm:text-[15px] ${
                    expandedPlot ? "" : "line-clamp-3"
                  }`}
                >
                  {plot}
                </p>
                {plotLong && (
                  <button
                    type="button"
                    onClick={() => setExpandedPlot((value) => !value)}
                    className="mt-1 text-[13px] font-medium text-white/55 transition-colors hover:text-white/80"
                  >
                    {expandedPlot ? "Mostra meno" : "Leggi tutto"}
                  </button>
                )}
              </div>
            )}

            {(detail.castLine || detail.genreLine) && (
              <div className="mt-4 space-y-1 text-[13px] text-white/65 sm:text-[14px]">
                {detail.castLine && (
                  <p>
                    <span className="font-medium text-white/80">Cast:</span>{" "}
                    {detail.castLine}
                  </p>
                )}
                {detail.genreLine && (
                  <p>
                    <span className="font-medium text-white/80">Genere:</span>{" "}
                    {detail.genreLine}
                  </p>
                )}
              </div>
            )}
          </div>

          <DetailTabs
            active={activeTab}
            onChange={setActiveTab}
            showTrailer={!!detail.hasPreview && !!onPlayPreview}
          />
        </div>
      </div>

      {error && (
        <p className="page-px mt-4 text-[13px] text-red-400/90">{error}</p>
      )}

      <div className="page-px py-8 sm:py-10">
        {activeTab === "overview" && (
          <>
            {detail.hasPreview && onPlayPreview && (
              <section className="mb-10">
                <h2 className="lf-home-row__title mb-4">Trailer</h2>
                <div className="lf-row-scroll">
                  <div className="lf-row-scroll__track lf-row-scroll__track--trailers scrollbar-hide">
                    <LordFlixTrailerCard
                      thumbnailUrl={detail.heroImage}
                      title={`Trailer · ${detail.name}`}
                      disabled={previewLoading}
                      onClick={onPlayPreview}
                    />
                  </div>
                </div>
              </section>
            )}

            {showEpisodeList ? (
              <>
                <h2 className="mb-1 font-display text-xl font-semibold tracking-[-0.02em] text-text-primary">
                  Episodi
                </h2>
                <p className="mb-6 text-[13px] text-text-muted">
                  Scegli un episodio da guardare
                </p>
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
              </>
            ) : showNoEpisodes ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-8 text-center">
                <h2 className="font-display text-lg font-semibold text-text-primary">
                  Nessun episodio disponibile
                </h2>
                <p className="mt-2 text-[14px] text-text-secondary">
                  Questo titolo non ha ancora episodi pubblicati su AnimeSaturn, oppure
                  la versione selezionata non è quella corretta. Prova un&apos;altra
                  versione dalla sezione Anime.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl space-y-4 text-[14px] leading-relaxed text-text-secondary">
                {plot ? (
                  <p>{plot}</p>
                ) : (
                  <p className="text-text-muted">
                    Nessuna descrizione disponibile per questo titolo.
                  </p>
                )}
                {detail.genreLine && (
                  <p>
                    <span className="font-medium text-text-primary">
                      Genere:
                    </span>{" "}
                    {detail.genreLine}
                  </p>
                )}
                {detail.castLine && (
                  <p>
                    <span className="font-medium text-text-primary">Cast:</span>{" "}
                    {detail.castLine}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "details" && (
          <dl className="grid max-w-3xl gap-4 sm:grid-cols-2">
            {detailFields.map(([label, value]) =>
              value ? (
                <div
                  key={label}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {label}
                  </dt>
                  <dd className="mt-1 text-[14px] text-text-primary">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}

        {activeTab === "trailer" && detail.hasPreview && onPlayPreview && (
          <div className="max-w-3xl">
            <p className="mb-4 text-[14px] text-text-secondary">
              Guarda l&apos;anteprima ufficiale prima di avviare la
              riproduzione.
            </p>
            <div className="lf-row-scroll">
              <div className="lf-row-scroll__track lf-row-scroll__track--trailers scrollbar-hide">
                <LordFlixTrailerCard
                  thumbnailUrl={detail.heroImage}
                  title={`Trailer · ${detail.name}`}
                  disabled={previewLoading}
                  onClick={onPlayPreview}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {footer}
    </div>
  );
}
