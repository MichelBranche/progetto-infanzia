import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { useCloudAccount } from "./CloudAccountContext";
import { useMyPresenceStatus } from "../hooks/useMyPresenceStatus";
import {
  useAppTopNavFriendsList,
  type AppTopNavFriendEntry,
} from "../hooks/useAppTopNavFriendsList";
import { AppTopNavFriendsMenuPanel } from "../components/AppTopNavFriendsMenu";
import { useCompactShell } from "./MobileDeviceContext";
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

function useFriendsMenuLayout() {
  const { isCompactShell } = useCompactShell();
  return isCompactShell;
}

export function FriendsMenuProvider({
  profileId,
  profileName,
  onNavigate,
  onJoinWatchParty,
  children,
}: FriendsMenuProviderProps) {
  const { profile: cloudProfile } = useCloudAccount();
  const isMobile = useFriendsMenuLayout();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const sheetDragControls = useDragControls();

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
      if (!isMobile) {
        updatePanelPos(anchor);
      }
      setOpen(true);
    },
    [isMobile, updatePanelPos],
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
    if (!open || isMobile) return;

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
  }, [closeMenu, isMobile, open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenu, open]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const handleSheetDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > 110 || info.velocity.y > 650) {
        closeMenu();
      }
    },
    [closeMenu],
  );

  const startSheetDrag = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      sheetDragControls.start(event);
    },
    [sheetDragControls],
  );

  const panelProps = {
    friends,
    onlineCount,
    refreshing,
    status,
    setStatus,
    refreshAll,
    cloudProfile,
    onClose: closeMenu,
    onNavigate: (id: string) => {
      closeMenu();
      onNavigate(id);
    },
    onJoinWatchParty,
    onSheetDragStart: startSheetDrag,
  };

  const value: FriendsMenuContextValue = useMemo(
    () => ({
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
    }),
    [
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
    ],
  );

  return (
    <FriendsMenuContext.Provider value={value}>
      {children}
      {createPortal(
        <>
          <AnimatePresence>
            {open && isMobile && (
              <motion.div
                key="friends-sheet-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="friends-menu-sheet__backdrop fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm"
                onClick={closeMenu}
              >
                <motion.div
                  ref={panelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Menu amici"
                  drag="y"
                  dragControls={sheetDragControls}
                  dragListener={false}
                  dragConstraints={{ top: 0 }}
                  dragElastic={{ top: 0, bottom: 0.55 }}
                  onDragEnd={handleSheetDragEnd}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                  onClick={(event) => event.stopPropagation()}
                  className="friends-menu-sheet__panel w-full"
                >
                  <AppTopNavFriendsMenuPanel variant="sheet" {...panelProps} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {open && !isMobile && panelPos && (
            <div
              ref={panelRef}
              className="app-top-nav__friends-panel fixed z-[200] hidden md:block"
              style={{
                top: panelPos.top,
                left: panelPos.left,
                width: Math.min(window.innerWidth * 0.92, 340),
              }}
            >
              <AppTopNavFriendsMenuPanel variant="dropdown" {...panelProps} />
            </div>
          )}
        </>,
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
