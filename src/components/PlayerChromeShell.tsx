import { memo, type ReactNode, type RefObject } from "react";
import {
  Cast,
  Languages,
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipBack,
  SkipForward,
  Subtitles,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { episodeCodeLabel, episodeDisplayTitle } from "../lib/browse";
import {
  PLAYER_STREAM_AUDIO_OPTIONS,
  type PlayerStreamAudioLanguage,
} from "../lib/playerAudioLanguage";
import type { MediaItem } from "../types/media";
import { mediaTypeLabel } from "../types/media";
import { PlayerChromeButton } from "./PlayerChromeButton";
import { PlayerScrubBar } from "./PlayerScrubBar";
import { PlayerVolumeControl } from "./PlayerVolumeControl";

export interface PlayerMenuOption {
  id: number;
  label: string;
}

interface PlayerChromeShellProps {
  visible: boolean;
  media: MediaItem;
  videoRef: RefObject<HTMLVideoElement | null>;
  timeLabelRef: RefObject<HTMLSpanElement | null>;
  duration: number;
  playing: boolean;
  muted: boolean;
  isFullscreen: boolean;
  isHls: boolean;
  scrubDisabled: boolean;
  isPartyGuest: boolean;
  hasEpisodes: boolean;
  canCast: boolean;
  castingTo: string | null;
  partySessionActive: boolean;
  prevEp: MediaItem | null;
  nextEp: MediaItem | null;
  qualityOptions: PlayerMenuOption[];
  subtitleOptions: PlayerMenuOption[];
  audioOptions: PlayerMenuOption[];
  selectedQuality: number;
  selectedSubtitle: number;
  selectedAudio: number;
  streamAudioLang: PlayerStreamAudioLanguage;
  canShowAudioMenu: boolean;
  audioSwitching: boolean;
  showQualityMenu: boolean;
  showSubtitleMenu: boolean;
  showAudioMenu: boolean;
  showMoreMenu: boolean;
  activeQualityLabel: string;
  activeSubtitleLabel: string;
  activeAudioLabel: string;
  onBusyChange: (busy: boolean) => void;
  onSeek: (time: number) => void;
  onSeekCommit?: (time: number) => void;
  onBack: () => void;
  onTogglePlay: () => void;
  onSkip: (delta: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onOpenEpisodes: () => void;
  onOpenCast: () => void;
  onOpenParty: () => void;
  onStopCast: () => void;
  onPlayPrevEpisode?: () => void;
  onPlayNextEpisode?: () => void;
  onToggleQualityMenu: () => void;
  onToggleSubtitleMenu: () => void;
  onToggleAudioMenu: () => void;
  onToggleMoreMenu: () => void;
  onSelectQuality: (level: number) => void;
  onSelectSubtitle: (track: number) => void;
  onSelectAudio: (track: number) => void;
  onSelectStreamAudio: (lang: PlayerStreamAudioLanguage) => void;
  formatClock: (seconds: number) => string;
}

function episodeCode(ep: MediaItem) {
  return episodeCodeLabel(ep) ?? "";
}

function MenuPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute bottom-full right-0 z-40 mb-2 max-h-[min(320px,50vh)] min-w-[168px] overflow-y-auto rounded-lg border border-white/10 bg-black/95 py-1 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * Chrome Netflix-like isolato: fade CSS, scrub/volume DOM.
 * I menu React si aggiornano solo quando cambiano le props menu.
 */
export const PlayerChromeShell = memo(function PlayerChromeShell({
  visible,
  media,
  videoRef,
  timeLabelRef,
  duration,
  playing,
  muted,
  isFullscreen,
  isHls,
  scrubDisabled,
  isPartyGuest,
  hasEpisodes,
  canCast,
  castingTo,
  partySessionActive,
  prevEp,
  nextEp,
  qualityOptions,
  subtitleOptions,
  audioOptions,
  selectedQuality,
  selectedSubtitle,
  selectedAudio,
  streamAudioLang,
  canShowAudioMenu,
  audioSwitching,
  showQualityMenu,
  showSubtitleMenu,
  showAudioMenu,
  showMoreMenu,
  activeQualityLabel,
  activeSubtitleLabel,
  activeAudioLabel,
  onBusyChange,
  onSeek,
  onSeekCommit,
  onBack,
  onTogglePlay,
  onSkip,
  onToggleMute,
  onToggleFullscreen,
  onOpenEpisodes,
  onOpenCast,
  onOpenParty,
  onStopCast,
  onPlayPrevEpisode,
  onPlayNextEpisode,
  onToggleQualityMenu,
  onToggleSubtitleMenu,
  onToggleAudioMenu,
  onToggleMoreMenu,
  onSelectQuality,
  onSelectSubtitle,
  onSelectAudio,
  onSelectStreamAudio,
  formatClock,
}: PlayerChromeShellProps) {
  const showQuality = isHls && qualityOptions.length > 1;
  const showSubs = isHls && subtitleOptions.length > 1;

  return (
    <>
      {/* Back flottante — sempre sopra al titolo */}
      <div
        className={`player-chrome pointer-events-none absolute inset-0 z-[34] ${
          visible ? "player-chrome--visible" : ""
        }`}
      >
        <div
          className={`absolute left-0 top-0 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5 ${
            visible ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <PlayerChromeButton
            size="lg"
            onClick={onBack}
            aria-label="Esci dal player"
            title="Indietro"
            className="border-white/20 bg-black/55"
          >
            <ArrowLeftIcon />
          </PlayerChromeButton>
        </div>
      </div>

      <div
        className={`player-chrome pointer-events-none absolute inset-0 z-[30] flex flex-col justify-between ${
          visible ? "player-chrome--visible" : ""
        }`}
      >
        {/* Top meta */}
        <div
          className={`bg-gradient-to-b from-black/80 to-transparent px-3 py-3 pl-14 sm:px-6 sm:py-5 sm:pl-[4.75rem] ${
            visible ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div className="flex items-start gap-2 sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[15px] font-semibold text-white sm:text-lg">
                {episodeDisplayTitle(media)}
              </h1>
              <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-white/50 sm:text-[11px]">
                {episodeCode(media) && <span>{episodeCode(media)}</span>}
                {episodeCode(media) && media.seriesTitle && (
                  <span className="text-white/30"> · </span>
                )}
                {media.seriesTitle && <span>{media.seriesTitle}</span>}
                {!episodeCode(media) && !media.seriesTitle && (
                  <span>{mediaTypeLabel(media.mediaType)}</span>
                )}
              </p>
            </div>

            <div className="hidden items-center gap-1 sm:flex sm:gap-2">
              {hasEpisodes && (
                <PlayerChromeButton
                  variant="pill"
                  onClick={onOpenEpisodes}
                  aria-label="Episodi"
                >
                  <ListVideo className="h-4 w-4" />
                  <span className="text-[12px]">Episodi</span>
                </PlayerChromeButton>
              )}
              {canCast && (
                <PlayerChromeButton
                  onClick={onOpenCast}
                  title="Trasmetti alla TV"
                  aria-label="Trasmetti alla TV"
                  className={
                    castingTo
                      ? "border-mint/40 bg-mint/15 text-mint hover:bg-mint/20"
                      : ""
                  }
                >
                  <Cast className="h-4 w-4" />
                </PlayerChromeButton>
              )}
              <PlayerChromeButton
                onClick={onOpenParty}
                title="Guarda insieme"
                aria-label="Guarda insieme"
                className={
                  partySessionActive
                    ? "border-accent/40 bg-accent/15 text-accent hover:bg-accent/20"
                    : ""
                }
              >
                <Users className="h-4 w-4" />
              </PlayerChromeButton>
            </div>
          </div>
        </div>

        {castingTo && (
          <div className="pointer-events-auto absolute left-1/2 top-20 z-20 max-w-sm -translate-x-1/2 rounded-xl border border-mint/30 bg-black/85 px-4 py-2.5 text-center text-[12px] leading-relaxed text-mint sm:top-24">
            Trasmissione su {castingTo}
            <span className="mt-0.5 block text-[11px] text-mint/80">
              Usa il telecomando TV o i controlli qui sotto
            </span>
            <button
              type="button"
              onClick={onStopCast}
              className="mt-2 rounded-full border border-mint/40 px-3 py-1 text-[11px] font-medium text-mint transition-colors hover:bg-mint/10"
            >
              Interrompi trasmissione
            </button>
          </div>
        )}

        {/* Bottom controls */}
        <div
          className={`bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 sm:px-6 sm:pb-6 sm:pt-16 ${
            visible ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <PlayerScrubBar
            videoRef={videoRef}
            duration={duration}
            disabled={scrubDisabled}
            onBusyChange={onBusyChange}
            onSeek={onSeek}
            onSeekCommit={onSeekCommit}
          />

          <div className="flex items-center justify-between gap-1.5 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-2">
              <PlayerChromeButton
                onClick={onTogglePlay}
                disabled={isPartyGuest}
                size="lg"
                aria-label={playing ? "Pausa" : "Play"}
                title={isPartyGuest ? "Controlli gestiti dall'host" : undefined}
                className="border-transparent bg-transparent shadow-none hover:bg-white/10 disabled:bg-transparent"
              >
                {playing ? (
                  <Pause className="h-7 w-7" fill="currentColor" />
                ) : (
                  <Play className="h-7 w-7 fill-current" />
                )}
              </PlayerChromeButton>

              <PlayerChromeButton
                onClick={() => onSkip(-10)}
                disabled={isPartyGuest}
                aria-label="Indietro 10 secondi"
                title="Indietro 10s"
                className="border-transparent bg-transparent shadow-none hover:bg-white/10 disabled:bg-transparent"
              >
                <RotateCcw className="h-5 w-5" />
              </PlayerChromeButton>
              <PlayerChromeButton
                onClick={() => onSkip(10)}
                disabled={isPartyGuest}
                aria-label="Avanti 10 secondi"
                title="Avanti 10s"
                className="border-transparent bg-transparent shadow-none hover:bg-white/10 disabled:bg-transparent"
              >
                <RotateCw className="h-5 w-5" />
              </PlayerChromeButton>

              {prevEp && onPlayPrevEpisode && (
                <button
                  type="button"
                  onClick={onPlayPrevEpisode}
                  className="hidden h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-white/90 transition-colors hover:bg-white/10 hover:text-white md:flex"
                  title="Episodio precedente"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
              )}
              {nextEp && onPlayNextEpisode && (
                <button
                  type="button"
                  onClick={onPlayNextEpisode}
                  className="hidden h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-white/90 transition-colors hover:bg-white/10 hover:text-white md:flex"
                  title="Prossimo episodio"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              )}

              <PlayerVolumeControl
                videoRef={videoRef}
                onBusyChange={onBusyChange}
              />

              <button
                type="button"
                onClick={onToggleMute}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white sm:hidden"
                aria-label={muted ? "Attiva audio" : "Disattiva audio"}
              >
                {muted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>

              <span
                ref={timeLabelRef}
                className="ml-1 truncate text-[11px] tabular-nums text-white/70 sm:text-[12px]"
              >
                {formatClock(0)} / {formatClock(duration)}
              </span>
            </div>

            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Desktop secondary menus */}
              {showQuality && (
                <div className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleQualityMenu();
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
                      showQualityMenu ? "bg-white/10 text-white" : ""
                    }`}
                    title="Qualità video"
                    aria-label="Qualità video"
                  >
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden text-[12px] font-medium md:inline">
                      {activeQualityLabel}
                    </span>
                  </button>
                  {showQualityMenu && (
                    <MenuPanel title="Qualità">
                      {qualityOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onSelectQuality(option.id)}
                          className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                            selectedQuality === option.id
                              ? "text-mint"
                              : "text-white/85"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </MenuPanel>
                  )}
                </div>
              )}

              {showSubs && (
                <div className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSubtitleMenu();
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
                      showSubtitleMenu || selectedSubtitle >= 0
                        ? "bg-white/10 text-white"
                        : ""
                    }`}
                    title="Sottotitoli"
                    aria-label="Sottotitoli"
                  >
                    <Subtitles className="h-4 w-4" />
                    <span className="hidden max-w-[96px] truncate text-[12px] font-medium md:inline">
                      {activeSubtitleLabel}
                    </span>
                  </button>
                  {showSubtitleMenu && (
                    <MenuPanel title="Sottotitoli">
                      {subtitleOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onSelectSubtitle(option.id)}
                          className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                            selectedSubtitle === option.id
                              ? "text-mint"
                              : "text-white/85"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </MenuPanel>
                  )}
                </div>
              )}

              {canShowAudioMenu && (
                <div className="relative hidden sm:block">
                  <button
                    type="button"
                    disabled={audioSwitching}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAudioMenu();
                    }}
                    className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 ${
                      showAudioMenu ? "bg-white/10 text-white" : ""
                    }`}
                    title="Lingua audio"
                    aria-label="Lingua audio"
                  >
                    {audioSwitching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4" />
                    )}
                    <span className="hidden max-w-[108px] truncate text-[12px] font-medium md:inline">
                      {activeAudioLabel}
                    </span>
                  </button>
                  {showAudioMenu && (
                    <MenuPanel title="Lingua audio">
                      {PLAYER_STREAM_AUDIO_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onSelectStreamAudio(option.id)}
                          className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                            streamAudioLang === option.id
                              ? "text-mint"
                              : "text-white/85"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                      {audioOptions.length > 1 && (
                        <div className="my-1 border-t border-white/10" />
                      )}
                      {audioOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onSelectAudio(option.id)}
                          className={`flex w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${
                            selectedAudio === option.id
                              ? "text-mint"
                              : "text-white/85"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </MenuPanel>
                  )}
                </div>
              )}

              {/* Mobile overflow */}
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMoreMenu();
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white ${
                    showMoreMenu ? "bg-white/10 text-white" : ""
                  }`}
                  aria-label="Altre opzioni"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {showMoreMenu && (
                  <div
                    className="absolute bottom-full right-0 z-40 mb-2 min-w-[200px] overflow-hidden rounded-lg border border-white/10 bg-black/95 py-1 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {hasEpisodes && (
                      <button
                        type="button"
                        onClick={onOpenEpisodes}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-white/85 hover:bg-white/10"
                      >
                        <ListVideo className="h-4 w-4" /> Episodi
                      </button>
                    )}
                    {canCast && (
                      <button
                        type="button"
                        onClick={onOpenCast}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-white/85 hover:bg-white/10"
                      >
                        <Cast className="h-4 w-4" /> Trasmetti
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenParty}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-white/85 hover:bg-white/10"
                    >
                      <Users className="h-4 w-4" /> Guarda insieme
                    </button>
                    {showQuality && (
                      <>
                        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                          Qualità
                        </p>
                        {qualityOptions.map((option) => (
                          <button
                            key={`q-${option.id}`}
                            type="button"
                            onClick={() => onSelectQuality(option.id)}
                            className={`flex w-full px-3 py-2.5 text-left text-[13px] hover:bg-white/10 ${
                              selectedQuality === option.id
                                ? "text-mint"
                                : "text-white/85"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </>
                    )}
                    {showSubs && (
                      <>
                        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                          Sottotitoli
                        </p>
                        {subtitleOptions.map((option) => (
                          <button
                            key={`s-${option.id}`}
                            type="button"
                            onClick={() => onSelectSubtitle(option.id)}
                            className={`flex w-full px-3 py-2.5 text-left text-[13px] hover:bg-white/10 ${
                              selectedSubtitle === option.id
                                ? "text-mint"
                                : "text-white/85"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </>
                    )}
                    {canShowAudioMenu && (
                      <>
                        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                          Audio
                        </p>
                        {PLAYER_STREAM_AUDIO_OPTIONS.map((option) => (
                          <button
                            key={`a-stream-${option.id}`}
                            type="button"
                            onClick={() => onSelectStreamAudio(option.id)}
                            className={`flex w-full px-3 py-2.5 text-left text-[13px] hover:bg-white/10 ${
                              streamAudioLang === option.id
                                ? "text-mint"
                                : "text-white/85"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                        {audioOptions.map((option) => (
                          <button
                            key={`a-${option.id}`}
                            type="button"
                            onClick={() => onSelectAudio(option.id)}
                            className={`flex w-full px-3 py-2.5 text-left text-[13px] hover:bg-white/10 ${
                              selectedAudio === option.id
                                ? "text-mint"
                                : "text-white/85"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onToggleFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
                aria-label={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

function ArrowLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]"
      aria-hidden
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}
