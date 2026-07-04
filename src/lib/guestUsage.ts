export const GUEST_DAILY_LIMIT_SECONDS = 2 * 60 * 60;

const STORAGE_KEY = "branchefy-guest-daily-usage";

interface GuestUsageState {
  date: string;
  secondsUsed: number;
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readState(): GuestUsageState {
  const today = localDateKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: today, secondsUsed: 0 };
    const parsed = JSON.parse(raw) as GuestUsageState;
    if (parsed.date !== today) return { date: today, secondsUsed: 0 };
    return {
      date: today,
      secondsUsed: Math.max(0, Number(parsed.secondsUsed) || 0),
    };
  } catch {
    return { date: today, secondsUsed: 0 };
  }
}

function writeState(state: GuestUsageState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getGuestSecondsUsedToday(): number {
  return readState().secondsUsed;
}

export function getGuestSecondsRemaining(): number {
  return Math.max(0, GUEST_DAILY_LIMIT_SECONDS - getGuestSecondsUsedToday());
}

export function isGuestLimitReached(): boolean {
  return getGuestSecondsUsedToday() >= GUEST_DAILY_LIMIT_SECONDS;
}

export function addGuestUsageSeconds(seconds: number): number {
  if (seconds <= 0) return getGuestSecondsUsedToday();
  const state = readState();
  state.secondsUsed = Math.min(
    GUEST_DAILY_LIMIT_SECONDS,
    state.secondsUsed + seconds,
  );
  writeState(state);
  return state.secondsUsed;
}
