export type FeedbackType = "bug" | "feedback" | "feature" | "title";

export type FeedbackStatus = "open" | "resolved";

export type FeedbackBucket = "inbox" | "resolved" | "trash";

export const FEEDBACK_TRASH_RETENTION_DAYS = 30;

export interface FeedbackContext {
  activeNav: string;
  appVersion: string;
  platform: string;
}

export interface SubmitFeedbackInput {
  type: FeedbackType;
  message: string;
  subject?: string;
  profileName: string;
  profileRole: string;
  userId?: string;
  context: FeedbackContext;
}

export interface FeedbackTypeOption {
  id: FeedbackType;
  label: string;
  description: string;
  placeholder: string;
  subjectLabel?: string;
  subjectPlaceholder?: string;
}

export const FEEDBACK_TYPE_OPTIONS: FeedbackTypeOption[] = [
  {
    id: "bug",
    label: "Bug",
    description: "Qualcosa non funziona",
    placeholder:
      "Descrivi cosa è successo, cosa ti aspettavi e i passi per ripeterlo…",
  },
  {
    id: "feedback",
    label: "Feedback",
    description: "Opinioni e miglioramenti",
    placeholder:
      "Cosa ti piace o cosa vorresti migliorare nell'esperienza generale…",
  },
  {
    id: "feature",
    label: "Nuova funzione",
    description: "Richiesta di funzionalità",
    placeholder:
      "Spiega la funzione che vorresti e come ti sarebbe utile nell'app…",
    subjectLabel: "Funzione richiesta",
    subjectPlaceholder: "Es. Filtrare per anno, modalità offline…",
  },
  {
    id: "title",
    label: "Titolo mancante",
    description: "Film, serie o anime da aggiungere",
    placeholder:
      "Aggiungi dettagli utili: anno, piattaforma, lingua, stagione/episodio…",
    subjectLabel: "Titolo richiesto",
    subjectPlaceholder: "Es. One Piece, Shrek 2, Breaking Bad…",
  },
];

export interface AppFeedbackRecord {
  id: string;
  userId?: string;
  profileName: string;
  profileRole: string;
  type: FeedbackType;
  status: FeedbackStatus;
  subject?: string;
  message: string;
  context?: FeedbackContext;
  appVersion?: string;
  platform?: string;
  createdAt: string;
  resolvedAt?: string;
  deletedAt?: string;
}

export function feedbackDaysUntilPurge(deletedAt: string): number {
  const purgeAt =
    new Date(deletedAt).getTime() +
    FEEDBACK_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function feedbackTypeLabel(type: FeedbackType): string {
  return FEEDBACK_TYPE_OPTIONS.find((opt) => opt.id === type)?.label ?? type;
}
