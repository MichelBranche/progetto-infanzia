import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Profile } from "../types/profile";
import { fetchProfileAvatarDataUrl } from "./profilesApi";

export const PROFILE_AVATAR_ACCEPT = "image/jpeg,.jpg,.jpeg";
export const PROFILE_AVATAR_MAX_BYTES = 1024 * 1024;
export const PROFILE_AVATAR_DB_SENTINEL = "db:jpeg";

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function hasMagic(bytes: Uint8Array, magic: readonly number[]) {
  return magic.every((value, index) => bytes[index] === value);
}

export function isDbStoredAvatar(path?: string | null): boolean {
  return path === PROFILE_AVATAR_DB_SENTINEL;
}

export function isAllowedProfileAvatarBytes(bytes: Uint8Array): boolean {
  return hasMagic(bytes, JPEG_MAGIC);
}

export function isAllowedProfileAvatarFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const extOk = name.endsWith(".jpg") || name.endsWith(".jpeg");
  const mimeOk = file.type === "image/jpeg" || file.type === "";
  return extOk && mimeOk;
}

const avatarDataUrlCache = new Map<string, string>();

export function primeProfileAvatarCache(profileId: string, dataUrl: string) {
  avatarDataUrlCache.set(profileId, dataUrl);
}

export function invalidateProfileAvatarCache(profileId: string) {
  avatarDataUrlCache.delete(profileId);
}

export function profileAvatarSrc(profile: Pick<Profile, "avatarImagePath">): string | null {
  const path = profile.avatarImagePath;
  if (!path) return null;
  if (path.startsWith("data:")) return path;
  if (isDbStoredAvatar(path)) return null;
  if (isTauri()) return convertFileSrc(path);
  return path;
}

export async function resolveProfileAvatarSrc(
  profileId: string,
  path?: string | null,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("data:")) return path;
  if (isDbStoredAvatar(path)) {
    const cached = avatarDataUrlCache.get(profileId);
    if (cached) return cached;
    const dataUrl = await fetchProfileAvatarDataUrl(profileId);
    if (dataUrl) avatarDataUrlCache.set(profileId, dataUrl);
    return dataUrl;
  }
  if (isTauri()) return convertFileSrc(path);
  return path;
}

export async function pickProfileAvatarPath(): Promise<string | null> {
  if (!isTauri()) return null;

  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Foto profilo JPEG",
        extensions: ["jpg", "jpeg"],
      },
    ],
  });

  if (!selected || typeof selected !== "string") return null;
  return selected;
}

export async function readProfileAvatarFile(file: File): Promise<string> {
  if (!isAllowedProfileAvatarFile(file)) {
    throw new Error("Formato non supportato. Carica solo immagini JPEG (.jpg).");
  }
  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("L'immagine è troppo grande (max 1 MB).");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isAllowedProfileAvatarBytes(bytes)) {
    throw new Error("Il file selezionato non è un'immagine JPEG valida.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Impossibile leggere l'immagine."));
    };
    reader.onerror = () => reject(new Error("Impossibile leggere l'immagine."));
    reader.readAsDataURL(file);
  });
}

export function profileAvatarPreviewFromPath(path: string): string {
  if (path.startsWith("data:")) return path;
  if (isDbStoredAvatar(path)) return "";
  if (isTauri()) return convertFileSrc(path);
  return path;
}
