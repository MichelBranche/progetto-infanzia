import type {
  CreateProfileInput,
  Profile,
  UpdateProfileInput,
} from "../types/profile";

const PROFILES_KEY = "branchefy-dev-profiles";
const PINS_KEY = "branchefy-dev-profile-pins";

function defaultProfiles(): Profile[] {
  const createdAt = new Date(0).toISOString();
  return [
    {
      id: "dev-profile-parent",
      name: "Dev",
      role: "parent",
      avatarColor: "#6b7fff",
      avatarEmoji: "👨",
      createdAt,
      hasPin: false,
    },
    {
      id: "dev-profile-child",
      name: "Bambino",
      role: "child",
      avatarColor: "#3ddbd9",
      avatarEmoji: "👧",
      createdAt,
      hasPin: false,
    },
    {
      id: "dev-profile-guest",
      name: "Ospite",
      role: "other",
      avatarColor: "#b8a4ff",
      avatarEmoji: "⭐",
      createdAt,
      hasPin: false,
    },
  ];
}

function readPins(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePins(pins: Record<string, string>) {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins));
}

function withPinState(profiles: Profile[]): Profile[] {
  const pins = readPins();
  return profiles.map((profile) => ({
    ...profile,
    hasPin: Boolean(pins[profile.id]),
  }));
}

function readProfilesRaw(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return defaultProfiles();
    const parsed = JSON.parse(raw) as Profile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultProfiles();
    }
    return parsed;
  } catch {
    return defaultProfiles();
  }
}

function writeProfiles(profiles: Profile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function ensureSeeded() {
  if (!localStorage.getItem(PROFILES_KEY)) {
    writeProfiles(defaultProfiles());
  }
}

export function fetchDevProfiles(): Profile[] {
  ensureSeeded();
  return withPinState(readProfilesRaw());
}

export function createDevProfile(input: CreateProfileInput): Profile {
  ensureSeeded();
  const profiles = readProfilesRaw();
  const profile: Profile = {
    id: `dev-profile-${crypto.randomUUID()}`,
    name: input.name.trim(),
    role: input.role,
    avatarColor: input.avatarColor,
    accentColor: input.accentColor,
    avatarStyle: input.avatarStyle ?? "emoji",
    avatarEmoji: input.avatarEmoji,
    createdAt: new Date().toISOString(),
    hasPin: false,
  };
  writeProfiles([...profiles, profile]);
  return profile;
}

export function updateDevProfile(
  id: string,
  input: UpdateProfileInput,
): Profile {
  const profiles = readProfilesRaw();
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
    hasPin: Boolean(readPins()[id]),
  };

  profiles[index] = updated;
  writeProfiles(profiles);
  return updated;
}

export function deleteDevProfile(id: string): void {
  const profiles = readProfilesRaw();
  if (profiles.length <= 1) {
    throw new Error("Devi mantenere almeno un profilo");
  }
  writeProfiles(profiles.filter((profile) => profile.id !== id));

  const pins = readPins();
  if (pins[id]) {
    delete pins[id];
    writePins(pins);
  }
}

export function verifyDevProfilePin(id: string, pin: string): boolean {
  const pins = readPins();
  return pins[id] === pin;
}

export function setDevProfilePin(
  profileId: string,
  pin: string,
  currentPin?: string,
): void {
  const profiles = readProfilesRaw();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error("Profilo non trovato");
  }

  const pins = readPins();
  if (profile.hasPin) {
    if (!currentPin || pins[profileId] !== currentPin) {
      throw new Error("PIN attuale non corretto");
    }
  }

  pins[profileId] = pin;
  writePins(pins);
}

export function removeDevProfilePin(profileId: string, currentPin: string): void {
  const pins = readPins();
  if (pins[profileId] !== currentPin) {
    throw new Error("PIN non corretto");
  }
  delete pins[profileId];
  writePins(pins);
}
