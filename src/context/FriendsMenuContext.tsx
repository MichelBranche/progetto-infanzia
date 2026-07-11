import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useCloudAccount } from "./CloudAccountContext";
import { useMyPresenceStatus } from "../hooks/useMyPresenceStatus";
import {
  useAppTopNavFriendsList,
  type AppTopNavFriendEntry,
} from "../hooks/useAppTopNavFriendsList";
import { AppTopNavFriendsMenuPanel } from "../components/AppTopNavFriendsMenu";
import type { WatchPartySession } from "../types/watchParty";
import type { UserPresenceStatus } from "../lib/userPresenceStatus";

type FriendsMenuContextValue = {
  open: boolean;
  friends: AppTopNavFriendEntry[];
  onlineCount: number;
  refreshing: boolean;
  status: UserPresenceStatus;
  setStatus: (status: UserPresenceStatus) => void;
  refreshAll: () => void;
  openMenu: (anchor?: HTMLElement | null) => void;
  closeMenu: () => void;
  toggleMenu: (anchor?: HTMLElement | null) => void;
  registerAnchor: (el: HTMLElement | null) => void;
};

const FriendsMenuContext = createContext<FriendsMenuContextValue | null>(null);

interface FriendsMenuProviderProps {
  profileId: string;
  profileName: string;
  onNavigate: (id: string) => void;
  onJoinWatchParty?: (session: WatchPartySession) => void;
  children: ReactNode;
}

export function FriendsMenuProvider({
  profileId,
  profileName,
  onNavigate,
  onJoinWatchParty,
  children,
}: FriendsMenuProviderProps) {
  const { profile: cloudProfile } = useCloudAccount();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { friends, onlineCount, refreshing, refreshAll } =
    useAppTopNavFriendsList(profileId, profileName, true, cloudProfile);
  const { status, setStatus } = useMyPresenceStatus(Boolean(cloudProfile));

  const updatePanelPos = useCallback((anchor?: HTMLElement | null) => {
    const el = anchor ?? anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(window.innerWidth * 0.92, 340);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPanelPos({ top: rect.bottom + 10, left });
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPanelPos(null);
  }, []);

  const openMenu = useCallback(
    (anchor?: HTMLElement | null) => {
      if (anchor) anchorRef.current = anchor;
      updatePanelPos(anchor);
      setOpen(true);
    },
    [updatePanelPos],
  );

  const toggleMenu = useCallback(
    (anchor?: HTMLElement | null) => {
      if (open) {
        closeMenu();
        return;
      }
      openMenu(anchor);
    },
    [closeMenu, open, openMenu],
  );

  const registerAnchor = useCallback((el: HTMLElement | null) => {
    anchorRef.current = el;
  }, []);

  useEffect(() => {
    if (!open) return;

    const onResize = () => updatePanelPos();
    window.addEventListener("resize", onResize);

    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      closeMenu();
    };

    const attachId = window.setTimeout(() => {
      document.addEventListener("click", onClick, true);
    }, 0);

    return () => {
      window.clearTimeout(attachId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("click", onClick, true);
    };
  }, [closeMenu, open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenu, open]);

  const value: FriendsMenuContextValue = {
    open,
    friends,
    onlineCount,
    refreshing,
    status,
    setStatus,
    refreshAll,
    openMenu,
    closeMenu,
    toggleMenu,
    registerAnchor,
  };

  return (
    <FriendsMenuContext.Provider value={value}>
      {children}
      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            className="app-top-nav__friends-panel fixed z-[200]"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: Math.min(window.innerWidth * 0.92, 340),
            }}
          >
            <AppTopNavFriendsMenuPanel
              friends={friends}
              onlineCount={onlineCount}
              refreshing={refreshing}
              status={status}
              setStatus={setStatus}
              refreshAll={refreshAll}
              cloudProfile={cloudProfile}
              onClose={closeMenu}
              onNavigate={(id) => {
                closeMenu();
                onNavigate(id);
              }}
              onJoinWatchParty={onJoinWatchParty}
            />
          </div>,
          document.body,
        )}
    </FriendsMenuContext.Provider>
  );
}

export function useFriendsMenu() {
  const ctx = useContext(FriendsMenuContext);
  if (!ctx) {
    throw new Error("useFriendsMenu must be used within FriendsMenuProvider");
  }
  return ctx;
}
