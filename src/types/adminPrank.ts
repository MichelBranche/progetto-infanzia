export type AdminPrankKind =
  | "jumpscare"
  | "fake_ban"
  | "shake"
  | "invert"
  | "idiot";

export type JumpscareVideoId = "jump1" | "jump2" | "jump3" | "jump4" | "jump5";

export interface AdminPrank {
  id: string;
  targetUserId: string;
  kind: AdminPrankKind;
  /** Per jumpscare: id video (`jump1`…`jump5`). Altrimenti testo opzionale. */
  message?: string;
  createdAt: string;
  expiresAt: string;
}

export const JUMPSCARE_VIDEOS: Array<{
  id: JumpscareVideoId;
  label: string;
  src: string;
}> = [
  { id: "jump1", label: "Jump 1", src: "/jumpscares/jump1.mp4" },
  { id: "jump2", label: "Jump 2", src: "/jumpscares/jump2.mp4" },
  { id: "jump3", label: "Jump 3", src: "/jumpscares/jump3.mp4" },
  { id: "jump4", label: "Jump 4", src: "/jumpscares/jump4.mp4" },
  { id: "jump5", label: "Jump 5", src: "/jumpscares/jump5.mp4" },
];

export function isJumpscareVideoId(value: string): value is JumpscareVideoId {
  return JUMPSCARE_VIDEOS.some((v) => v.id === value);
}

export function resolveJumpscareVideoSrc(message?: string): string {
  if (message && isJumpscareVideoId(message)) {
    return JUMPSCARE_VIDEOS.find((v) => v.id === message)!.src;
  }
  const pick = JUMPSCARE_VIDEOS[Math.floor(Math.random() * JUMPSCARE_VIDEOS.length)];
  return pick.src;
}

export const IDIOT_VIDEO_SRC = "/jumpscares/you-are-an-idiot.mp4";

export const ADMIN_PRANK_LABELS: Record<AdminPrankKind, string> = {
  jumpscare: "Jumpscare video",
  fake_ban: "Finto ban account",
  shake: "Scossa dello schermo",
  invert: "Colori invertiti",
  idiot: "You are an idiot",
};

export const ADMIN_PRANK_HINTS: Record<AdminPrankKind, string> = {
  jumpscare: "Video a schermo intero con audio. Scegli quale o lascia casuale.",
  fake_ban: "Popup serio di sospensione account, poi rivela lo scherzo.",
  shake: "Vibrazione / shake dell’intera UI per qualche secondo.",
  invert: "Filtro colori invertiti su tutta l’app per qualche secondo.",
  idiot: "App desktop: tante finestre col video sincronizzato + musica classica.",
};
