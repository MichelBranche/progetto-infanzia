import { useMemo } from "react";
import type { StremioMeta } from "../types/stremio";
import {
  titleDetailFromStremio,
  type TitleDetailEpisodeProgress,
} from "../lib/titleDetail";
import { TitleDetailPage, type TitleDetailPageProps } from "./TitleDetailPage";

interface StreamingTitlePageProps
  extends Omit<TitleDetailPageProps, "detail"> {
  meta: StremioMeta;
  episodeProgress?: Record<string, TitleDetailEpisodeProgress>;
  preferredVideoId?: string;
}

export function StreamingTitlePage({
  meta,
  episodeProgress,
  preferredVideoId,
  ...props
}: StreamingTitlePageProps) {
  const progressKey = episodeProgress
    ? Object.entries(episodeProgress)
        .map(([id, p]) => `${id}:${p.watchPosition}:${p.watchDuration ?? ""}`)
        .join("|")
    : "";
  const detail = useMemo(
    () => titleDetailFromStremio(meta, episodeProgress, preferredVideoId),
    [meta, progressKey, episodeProgress, preferredVideoId],
  );
  return (
    <TitleDetailPage
      detail={detail}
      seasonNumbers={meta.seasonNumbers}
      {...props}
    />
  );
}
