import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createProfile,
  deleteProfile,
  fetchProfiles,
  updateProfile,
  verifyProfilePin,
} from "../lib/profilesApi";
import {
  ACTIVE_PROFILE_KEY,
  isParentProfile,
  type CreateProfileInput,
  type Profile,
  type UpdateProfileInput,
} from "../types/profile";

interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  pendingProfile: Profile | null;
  loading: boolean;
  isManaging: boolean;
  selectProfile: (profile: Profile) => void;
  completePinUnlock: (profile: Profile) => void;
  cancelPinUnlock: () => void;
  verifyPin: (profileId: string, pin: string) => Promise<boolean>;
  clearProfile: () => void;
  startManaging: () => void;
  stopManaging: () => void;
  refreshProfiles: () => Promise<void>;
  createNewProfile: (input: CreateProfileInput) => Promise<Profile>;
  updateExistingProfile: (id: string, input: UpdateProfileInput) => Promise<Profile>;
  removeProfile: (id: string) => Promise<void>;
  isParent: boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isManaging, setIsManaging] = useState(false);

  const refreshProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProfiles();
      setProfiles(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const selectProfile = useCallback((profile: Profile) => {
    if (isManaging) return;
    if (profile.role === "parent" && profile.hasPin) {
      setPendingProfile(profile);
      return;
    }
    setActiveProfile(profile);
    sessionStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
    setIsManaging(false);
  }, [isManaging]);

  const completePinUnlock = useCallback((profile: Profile) => {
    setActiveProfile(profile);
    setPendingProfile(null);
    sessionStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
    setIsManaging(false);
  }, []);

  const cancelPinUnlock = useCallback(() => {
    setPendingProfile(null);
    sessionStorage.removeItem(ACTIVE_PROFILE_KEY);
  }, []);

  const verifyPin = useCallback(async (profileId: string, pin: string) => {
    return verifyProfilePin(profileId, pin);
  }, []);

  const clearProfile = useCallback(() => {
    setActiveProfile(null);
    setPendingProfile(null);
    sessionStorage.removeItem(ACTIVE_PROFILE_KEY);
    setIsManaging(false);
  }, []);

  const createNewProfile = useCallback(
    async (input: CreateProfileInput) => {
      const profile = await createProfile(input);
      await refreshProfiles();
      return profile;
    },
    [refreshProfiles],
  );

  const updateExistingProfile = useCallback(
    async (id: string, input: UpdateProfileInput) => {
      const profile = await updateProfile(id, input);
      await refreshProfiles();
      if (activeProfile?.id === id) {
        setActiveProfile(profile);
      }
      return profile;
    },
    [refreshProfiles, activeProfile?.id],
  );

  const removeProfile = useCallback(
    async (id: string) => {
      await deleteProfile(id);
      if (activeProfile?.id === id) {
        clearProfile();
      }
      await refreshProfiles();
    },
    [activeProfile?.id, clearProfile, refreshProfiles],
  );

  const value = useMemo(
    () => ({
      profiles,
      activeProfile,
      pendingProfile,
      loading,
      isManaging,
      selectProfile,
      completePinUnlock,
      cancelPinUnlock,
      verifyPin,
      clearProfile,
      startManaging: () => setIsManaging(true),
      stopManaging: () => setIsManaging(false),
      refreshProfiles,
      createNewProfile,
      updateExistingProfile,
      removeProfile,
      isParent: activeProfile ? isParentProfile(activeProfile) : false,
    }),
    [
      profiles,
      activeProfile,
      pendingProfile,
      loading,
      isManaging,
      selectProfile,
      completePinUnlock,
      cancelPinUnlock,
      verifyPin,
      clearProfile,
      refreshProfiles,
      createNewProfile,
      updateExistingProfile,
      removeProfile,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
