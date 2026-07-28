export type AdminPrankKind =
  | "jumpscare"
  | "fake_ban"
  | "shake"
  | "invert"
  | "idiot"
  | "bsod"
  | "fake_update"
  | "parental_lock"
  | "meltdown"
  | "nuke"
  | "face_dark"
  | "reflection"
  | "cmd_cascade"
  | "uac_spoof"
  | "ransomware"
  | "friend_takeover";

export type JumpscareVideoId = "jump1" | "jump2" | "jump3" | "jump4" | "jump5";

export interface AdminPrank {
  id: string;
  targetUserId: string;
  kind: AdminPrankKind;
  /** Per jumpscare/nuke/uac_spoof/face_dark: id video. Per friend_takeover: nome “amico”. Altrimenti testo opzionale. */
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
  const pick =
    JUMPSCARE_VIDEOS[Math.floor(Math.random() * JUMPSCARE_VIDEOS.length)];
  return pick.src;
}

export const IDIOT_VIDEO_SRC = "/jumpscares/you-are-an-idiot.mp4";

export const ADMIN_PRANK_LABELS: Record<AdminPrankKind, string> = {
  jumpscare: "Jumpscare video",
  fake_ban: "Finto ban account",
  shake: "Scossa dello schermo",
  invert: "Colori invertiti",
  idiot: "You are an idiot",
  bsod: "BSOD Branchefy",
  fake_update: "Finto update bloccante",
  parental_lock: "Finto blocco genitori",
  meltdown: "Schermo in fusione",
  nuke: "Nuke (chaos + jumpscare)",
  face_dark: "Face in the dark",
  reflection: "Reflection — ti vedo",
  cmd_cascade: "CMD cascade delete",
  uac_spoof: "UAC spoof + jumpscare",
  ransomware: "Ransomware timer",
  friend_takeover: "Friend takeover",
};

export const ADMIN_PRANK_HINTS: Record<AdminPrankKind, string> = {
  jumpscare: "Video a schermo intero con audio. Scegli quale o lascia casuale.",
  fake_ban: "Popup serio di sospensione account, poi rivela lo scherzo.",
  shake: "Vibrazione / shake dell’intera UI per qualche secondo.",
  invert: "Filtro colori invertiti su tutta l’app per qualche secondo.",
  idiot: "App desktop: tante finestre col video sincronizzato + musica classica.",
  bsod: "Schermo blu a fullscreen nativo (niente barra titolo). Blocca tutto finché non chiude.",
  fake_update: "Installazione Branchefy 9.9.9 con barra che si pianta, poi reveal.",
  parental_lock: "PIN genitori obbligatorio: qualunque codice fallisce, poi scherzo.",
  meltdown: "Mirror + hue + shake aggressivo per ~10 secondi. Molto invasivo.",
  nuke: "Meltdown breve + jumpscare a tutto volume. Il più pesante.",
  face_dark: "Fade lento al nero, occhi bianchi al centro, poi scream.",
  reflection: "Specchio nero ~2s con testo «ti vedo».",
  cmd_cascade: "Finestre nere che scrollano «deleting C:\\Users\\…» (fake).",
  uac_spoof: "Dialogo «Branchefy vuole apportare modifiche», poi jumpscare.",
  ransomware: "Countdown da 5:00, profili «crittografati», poi reveal netto.",
  friend_takeover:
    "Banner «X sta controllando la tua sessione» + scroll e cursore fake, poi reveal.",
};

/** Kind che usano il selettore video jumpscare. */
export function prankUsesJumpscareVideo(kind: AdminPrankKind): boolean {
  return (
    kind === "jumpscare" ||
    kind === "nuke" ||
    kind === "uac_spoof" ||
    kind === "face_dark"
  );
}
