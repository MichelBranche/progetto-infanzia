import type {
  CreateProfileInput,
  Profile,
  UpdateProfileInput,
} from "../types/profile";
import {
  isAppAccessSetupComplete,
  readAppAccessMode,
} from "./appAccess";
import { getSupabase } from "./supabaseClient";

const PROFILES_PREFIX = "branchefy-web-profiles";
const PINS_PREFIX = "branchefy-web-profile-pins";

export async function resolveWebProfilesScope(): Promise<string | null> {
  if (!isAppAccessSetupComplete()) return null;

  const mode = readAppAccessMode();
  if (mode === "guest") return "guest";

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  return userId ? `user:${userId}` : null;
}

function profilesKey(scope: string): string {
  return `${PROFILES_PREFIX}:${scope}`;
}

function pinsKey(scope: string): string {
  return `${PINS_PREFIX}:${scope}`;
}

function readPins(scope: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(pinsKey(scope));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePins(scope: string, pins: Record<string, string>) {
  localStorage.setItem(pinsKey(scope), JSON.stringify(pins));
}

function withPinState(scope: string, profiles: Profile[]): Profile[] {
  const pins = readPins(scope);
  return profiles.map((profile) => ({
    ...profile,
    hasPin: Boolean(pins[profile.id]),
  }));
}

function readProfilesRaw(scope: string): Profile[] {
  try {
    const raw = localStorage.getItem(profilesKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Profile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProfiles(scope: string, profiles: Profile[]) {
  localStorage.setItem(profilesKey(scope), JSON.stringify(profiles));
}

async function requireScope(): Promise<string> {
  const scope = await resolveWebProfilesScope();
  if (!scope) {
    throw new Error("Accedi o continua come ospite prima di gestire i profili.");
  }
  return scope;
}

export async function fetchWebProfiles(): Promise<Profile[]> {
  const scope = await resolveWebProfilesScope();
  if (!scope) return [];
  return withPinState(scope, readProfilesRaw(scope));
}

export async function createWebProfile(input: CreateProfileInput): Promise<Profile> {
  const scope = await requireScope();
  const profiles = readProfilesRaw(scope);
  const profile: Profile = {
    id: `web-profile-${crypto.randomUUID()}`,
    name: input.name.trim(),
    role: input.role,
    avatarColor: input.avatarColor,
    accentColor: input.accentColor,
    avatarStyle: input.avatarStyle ?? "emoji",
    avatarEmoji: input.avatarEmoji,
    createdAt: new Date().toISOString(),
    hasPin: false,
  };
  writeProfiles(scope, [...profiles, profile]);
  return profile;
}

export async function updateWebProfile(
  id: string,
  input: UpdateProfileInput,
): Promise<Profile> {
  const scope = await requireScope();
  const profiles = readProfilesRaw(scope);
  const index = profiles.findIndex((profile) => profile.id === id);
  if (index < 0) {
    throw new Error("Profilo non trovato");
  }

  const current = profiles[index];
  const updated: Profile = {
    ...current,
    name: input.name?.trim() || current.name,
    role: input.role ?? current.role,
    avatarColor: input.avatarColor ?? current.avatarColor,
    accentColor:
      input.accentColor !== undefined
        ? (input.accentColor ?? undefined)
        : current.accentColor,
    avatarStyle: input.avatarStyle ?? current.avatarStyle,
    avatarEmoji:
      input.avatarEmoji !== undefined
        ? (input.avatarEmoji ?? undefined)
        : current.avatarEmoji,
    avatarImagePath:
      input.avatarImagePath !== undefined
        ? (input.avatarImagePath ?? undefined)
        : current.avatarImagePath,
    hasPin: Boolean(readPins(scope)[id]),
  };

  profiles[index] = updated;
  writeProfiles(scope, profiles);
  return updated;
}

export async function deleteWebProfile(id: string): Promise<void> {
  const scope = await requireScope();
  const profiles = readProfilesRaw(scope);
  if (profiles.length <= 1) {
    throw new Error("Devi mantenere almeno un profilo");
  }
  writeProfiles(
    scope,
    profiles.filter((profile) => profile.id !== id),
  );

  const pins = readPins(scope);
  if (pins[id]) {
    delete pins[id];
    writePins(scope, pins);
  }
}

export async function verifyWebProfilePin(id: string, pin: string): Promise<boolean> {
  const scope = await resolveWebProfilesScope();
  if (!scope) return false;
  const pins = readPins(scope);
  return pins[id] === pin;
}

export async function setWebProfilePin(
  profileId: string,
  pin: string,
  currentPin?: string,
): Promise<void> {
  const scope = await requireScope();
  const profiles = readProfilesRaw(scope);
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error("Profilo non trovato");
  }

  const pins = readPins(scope);
  if (profile.hasPin) {
    if (!currentPin || pins[profileId] !== currentPin) {
      throw new Error("PIN attuale non corretto");
    }
  }

  pins[profileId] = pin;
  writePins(scope, pins);
}

export async function removeWebProfilePin(
  profileId: string,
  currentPin: string,
): Promise<void> {
  const scope = await requireScope();
  const pins = readPins(scope);
  if (pins[profileId] !== currentPin) {
    throw new Error("PIN non corretto");
  }
  delete pins[profileId];
  writePins(scope, pins);
}

export async function fetchWebProfileAvatarDataUrl(
  profileId: string,
): Promise<string | null> {
  const scope = await resolveWebProfilesScope();
  if (!scope) return null;
  const profile = readProfilesRaw(scope).find((item) => item.id === profileId);
  if (profile?.avatarImagePath?.startsWith("data:")) {
    return profile.avatarImagePath;
  }
  return null;
}
