export const GUEST_DAILY_LIMIT_SECONDS = 60 * 60;
export const GUEST_COOLDOWN_SECONDS = 24 * 60 * 60;

const DEVICE_KEY = "branchefy-guest-device-id";
const USAGE_KEY = "branchefy-guest-usage-v2";

interface GuestUsageState {
  deviceId: string;
  secondsUsed: number;
  /** Unix ms — blocco 24h dopo esaurimento del tempo. */
  cooldownUntil: number | null;
}

function readDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)?.trim();
    if (existing) return existing;
  } catch {
    // ignore
  }
  const created = `guest-${crypto.randomUUID()}`;
  try {
    localStorage.setItem(DEVICE_KEY, created);
  } catch {
    // ignore
  }
  return created;
}

export function getGuestDeviceId(): string {
  return readDeviceId();
}

function normalizeState(raw: Partial<GuestUsageState> | null): GuestUsageState {
  const deviceId = readDeviceId();
  const now = Date.now();
  const cooldownUntil =
    typeof raw?.cooldownUntil === "number" && raw.cooldownUntil > 0
      ? raw.cooldownUntil
      : null;

  if (cooldownUntil && now >= cooldownUntil) {
    return { deviceId, secondsUsed: 0, cooldownUntil: null };
  }

  if (raw?.deviceId && raw.deviceId !== deviceId) {
    return { deviceId, secondsUsed: 0, cooldownUntil: null };
  }

  return {
    deviceId,
    secondsUsed: Math.max(0, Math.min(GUEST_DAILY_LIMIT_SECONDS, Number(raw?.secondsUsed) || 0)),
    cooldownUntil,
  };
}

function readState(): GuestUsageState {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return normalizeState(null);
    return normalizeState(JSON.parse(raw) as Partial<GuestUsageState>);
  } catch {
    return normalizeState(null);
  }
}

function writeState(state: GuestUsageState): void {
  localStorage.setItem(USAGE_KEY, JSON.stringify(state));
}

export function getGuestSecondsUsedToday(): number {
  return readState().secondsUsed;
}

export function getGuestSecondsRemaining(): number {
  const state = readState();
  if (isGuestCooldownActive(state)) return 0;
  return Math.max(0, GUEST_DAILY_LIMIT_SECONDS - state.secondsUsed);
}

function isGuestCooldownActive(state: GuestUsageState): boolean {
  return Boolean(state.cooldownUntil && Date.now() < state.cooldownUntil);
}

export function getGuestCooldownRemainingMs(): number {
  const state = readState();
  if (!state.cooldownUntil) return 0;
  return Math.max(0, state.cooldownUntil - Date.now());
}

export function isGuestLimitReached(): boolean {
  const state = readState();
  return state.secondsUsed >= GUEST_DAILY_LIMIT_SECONDS || isGuestCooldownActive(state);
}

export function isGuestAccessBlocked(): boolean {
  return isGuestLimitReached();
}

export function addGuestUsageSeconds(seconds: number): number {
  if (seconds <= 0) return getGuestSecondsUsedToday();

  const state = readState();
  if (isGuestCooldownActive(state)) return state.secondsUsed;

  state.secondsUsed = Math.min(
    GUEST_DAILY_LIMIT_SECONDS,
    state.secondsUsed + seconds,
  );

  if (state.secondsUsed >= GUEST_DAILY_LIMIT_SECONDS && !state.cooldownUntil) {
    state.cooldownUntil = Date.now() + GUEST_COOLDOWN_SECONDS * 1000;
  }

  writeState(state);
  return state.secondsUsed;
}
