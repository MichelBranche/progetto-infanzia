import type { StremioMetaPreview } from "./stremio";

export type HomeTop10Mode = "sc" | "branchefy" | "manual";

export interface HomeTop10Config {
  mode: HomeTop10Mode;
  items: StremioMetaPreview[];
  updatedAt?: string;
}

export interface BranchefyTopPreview extends StremioMetaPreview {
  totalSeconds?: number;
  viewers?: number;
}
