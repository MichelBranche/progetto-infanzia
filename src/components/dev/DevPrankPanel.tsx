import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bug,
  Ghost,
  Loader2,
  RotateCcw,
  Send,
  Skull,
  Zap,
} from "lucide-react";
import { fetchDevCloudUsers } from "../../lib/devAdminApi";
import { sendAdminPrank } from "../../lib/adminPrankApi";
import { isAppOpenPresence } from "../../lib/devDashboardMetrics";
import type { DevCloudUser } from "../../types/devAdmin";
import type { AdminPrankKind } from "../../types/adminPrank";
import { ADMIN_PRANK_HINTS, ADMIN_PRANK_LABELS } from "../../types/adminPrank";
import {
  SettingsButton,
  SettingsField,
  SettingsInput,
  SettingsPill,
} from "../settings/SettingsUi";
import {
  DevDetailPane,
  DevErrorBanner,
  DevInfoBanner,
  DevListItem,
  DevLoadingState,
  DevMasterDetail,
  DevSidebar,
  DevUserAvatar,
} from "./DevConsoleUi";
import {
  JUMPSCARE_VIDEOS,
  type JumpscareVideoId,
} from "../../types/adminPrank";

const PRANK_OPTIONS: Array<{
  kind: AdminPrankKind;
  icon: typeof Skull;
  tone: string;
}> = [
  { kind: "jumpscare", icon: Skull, tone: "border-warm/30 bg-warm/10 text-warm" },
  { kind: "idiot", icon: Bug, tone: "border-yellow-400/35 bg-yellow-400/10 text-yellow-300" },
  { kind: "fake_ban", icon: Ghost, tone: "border-amber-400/25 bg-amber-400/10 text-amber-300" },
  { kind: "shake", icon: Zap, tone: "border-accent/25 bg-accent/10 text-accent" },
  { kind: "invert", icon: RotateCcw, tone: "border-mint/25 bg-mint/10 text-mint" },
];

export function DevPrankPanel() {
  const [users, setUsers] = useState<DevCloudUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<AdminPrankKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [jumpscareVideo, setJumpscareVideo] = useState<JumpscareVideoId | "random">(
    "random",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchDevCloudUsers();
      setUsers(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((u) => u.userId === prev)) return prev;
        const prefer =
          rows.find((u) => isAppOpenPresence(u)) ?? rows[0] ?? null;
        return prefer?.userId ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (onlineOnly && !isAppOpenPresence(user)) return false;
      if (!q) return true;
      return (
        user.email.toLowerCase().includes(q) ||
        user.displayName?.toLowerCase().includes(q) ||
        user.friendCode?.toLowerCase().includes(q)
      );
    });
  }, [users, query, onlineOnly]);

  const selected = useMemo(
    () => users.find((u) => u.userId === selectedId) ?? null,
    [users, selectedId],
  );

  const fire = async (kind: AdminPrankKind) => {
    if (!selected) return;
    setBusyKind(kind);
    setError(null);
    setMessage(null);
    try {
      const payloadMessage =
        kind === "jumpscare"
          ? jumpscareVideo === "random"
            ? undefined
            : jumpscareVideo
          : customMessage.trim() || undefined;

      await sendAdminPrank({
        targetUserId: selected.userId,
        kind,
        message: payloadMessage,
      });
      const name = selected.displayName || selected.email;
      const videoNote =
        kind === "jumpscare"
          ? jumpscareVideo === "random"
            ? " (video casuale)"
            : ` (${jumpscareVideo})`
          : "";
      setMessage(
        `${ADMIN_PRANK_LABELS[kind]}${videoNote} inviato a ${name}. Se è online lo vede subito.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKind(null);
    }
  };

  if (loading) return <DevLoadingState />;

  return (
    <div className="space-y-4">
      {error && <DevErrorBanner message={error} />}
      {message && (
        <div className="rounded-2xl border border-mint/25 bg-mint/10 px-4 py-3 text-[13px] text-mint">
          {message}
        </div>
      )}

      <DevInfoBanner>
        Scegli un utente e lancia uno scherzo. Funziona solo se ha l’app aperta
        (o la riapre entro ~3 minuti). Solo tu puoi inviare: l’RPC è protetta da
        admin.
      </DevInfoBanner>

      <DevMasterDetail
        sidebar={
          <DevSidebar title={`Utenti (${filtered.length})`}>
            <div className="mb-3 space-y-2 px-1">
              <SettingsInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca nome o email…"
              />
              <label className="flex items-center gap-2 px-1 text-[12px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={onlineOnly}
                  onChange={() => setOnlineOnly((v) => !v)}
                  className="rounded border-border"
                />
                Solo app aperte
              </label>
            </div>
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-text-muted">
                Nessun utente trovato.
              </p>
            ) : (
              filtered.map((user) => (
                <DevListItem
                  key={user.userId}
                  selected={user.userId === selectedId}
                  onClick={() => setSelectedId(user.userId)}
                  title={user.displayName || user.email}
                  subtitle={user.email}
                  meta={isAppOpenPresence(user) ? "App aperta" : "Offline"}
                    leading={
                    <DevUserAvatar
                      name={user.displayName || user.email}
                      imageUrl={user.avatarUrl}
                      online={isAppOpenPresence(user)}
                    />
                  }
                />
              ))
            )}
          </DevSidebar>
        }
        detail={
          <DevDetailPane
            empty={
              <p className="py-12 text-center text-[13px] text-text-muted">
                Seleziona un utente per trollarlo.
              </p>
            }
          >
            {selected ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <DevUserAvatar
                    name={selected.displayName || selected.email}
                    imageUrl={selected.avatarUrl}
                    online={isAppOpenPresence(selected)}
                  />
                  <div className="min-w-0">
                    <p className="font-display text-[18px] font-semibold tracking-[-0.03em] text-text-primary">
                      {selected.displayName || "Senza nome"}
                    </p>
                    <p className="truncate text-[13px] text-text-muted">
                      {selected.email}
                      {isAppOpenPresence(selected) ? " · online" : " · offline"}
                    </p>
                  </div>
                  <SettingsButton
                    variant="secondary"
                    onClick={() => void load()}
                    className="ml-auto px-3 py-2"
                  >
                    Aggiorna
                  </SettingsButton>
                </div>

                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-text-secondary">
                    Video jumpscare
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <SettingsPill
                      active={jumpscareVideo === "random"}
                      onClick={() => setJumpscareVideo("random")}
                    >
                      Casuale
                    </SettingsPill>
                    {JUMPSCARE_VIDEOS.map((video) => (
                      <SettingsPill
                        key={video.id}
                        active={jumpscareVideo === video.id}
                        onClick={() => setJumpscareVideo(video.id)}
                      >
                        {video.label}
                      </SettingsPill>
                    ))}
                  </div>
                </div>

                <SettingsField label="Messaggio opzionale (solo fake ban)">
                  <SettingsInput
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Es. Ti stavo osservando…"
                  />
                </SettingsField>

                <div className="grid gap-3 sm:grid-cols-2">
                  {PRANK_OPTIONS.map(({ kind, icon: Icon, tone }) => {
                    const busy = busyKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={busyKind !== null}
                        onClick={() => void fire(kind)}
                        className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-fill-muted p-4 text-left transition-colors hover:border-border-hover hover:bg-fill disabled:opacity-60"
                      >
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tone}`}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </span>
                        <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
                          {ADMIN_PRANK_LABELS[kind]}
                        </span>
                        <span className="text-[12px] leading-relaxed text-text-muted">
                          {ADMIN_PRANK_HINTS[kind]}
                        </span>
                        <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
                          <Send className="h-3.5 w-3.5" />
                          Lancia
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </DevDetailPane>
        }
      />
    </div>
  );
}
