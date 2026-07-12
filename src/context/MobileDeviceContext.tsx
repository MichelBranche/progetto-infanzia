import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import {
  COMPACT_SHELL_MEDIA,
  type ShellLayoutState,
  syncShellLayoutClasses,
} from "../lib/mobileDevice";

interface MobileDeviceContextValue extends ShellLayoutState {
  /** Touch phone/tablet (iPad, etc.) */
  isMobileDevice: boolean;
  /** Mobile shell: touch device OR viewport below lg (1024px) */
  isCompactShell: boolean;
}

const MobileDeviceContext = createContext<MobileDeviceContextValue | null>(null);

export function MobileDeviceProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<ShellLayoutState>(() =>
    syncShellLayoutClasses(),
  );

  useLayoutEffect(() => {
    const refresh = () => setLayout(syncShellLayoutClasses());

    refresh();
    const mq = window.matchMedia(COMPACT_SHELL_MEDIA);
    mq.addEventListener("change", refresh);
    window.addEventListener("orientationchange", refresh);
    window.addEventListener("resize", refresh);

    return () => {
      mq.removeEventListener("change", refresh);
      window.removeEventListener("orientationchange", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, []);

  const value: MobileDeviceContextValue = {
    mobile: layout.mobile,
    compact: layout.compact,
    isMobileDevice: layout.mobile,
    isCompactShell: layout.compact,
  };

  return (
    <MobileDeviceContext.Provider value={value}>
      {children}
    </MobileDeviceContext.Provider>
  );
}

export function useMobileDevice(): Pick<
  MobileDeviceContextValue,
  "isMobileDevice" | "mobile"
> {
  const ctx = useContext(MobileDeviceContext);
  if (!ctx) {
    throw new Error("useMobileDevice must be used within MobileDeviceProvider");
  }
  return { isMobileDevice: ctx.isMobileDevice, mobile: ctx.mobile };
}

export function useCompactShell(): Pick<
  MobileDeviceContextValue,
  "isCompactShell" | "compact"
> {
  const ctx = useContext(MobileDeviceContext);
  if (!ctx) {
    throw new Error("useCompactShell must be used within MobileDeviceProvider");
  }
  return { isCompactShell: ctx.isCompactShell, compact: ctx.compact };
}
