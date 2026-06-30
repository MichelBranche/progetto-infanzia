import type { StremioMeta } from "../types/stremio";
import { titleDetailFromStremio } from "../lib/titleDetail";
import { TitleDetailPage, type TitleDetailPageProps } from "./TitleDetailPage";

interface StreamingTitlePageProps
  extends Omit<TitleDetailPageProps, "detail"> {
  meta: StremioMeta;
}

export function StreamingTitlePage({
  meta,
  ...props
}: StreamingTitlePageProps) {
  return <TitleDetailPage detail={titleDetailFromStremio(meta)} {...props} />;
}
