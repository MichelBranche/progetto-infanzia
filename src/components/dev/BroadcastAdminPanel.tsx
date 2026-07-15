import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Megaphone,
  Plus,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  createDevBroadcast,
  deleteDevBroadcast,
  fetchDevBroadcasts,
  formatBroadcastWindow,
  isBroadcastActiveNow,
  updateDevBroadcast,
} from "../../lib/appBroadcastApi";
import type { AppBroadcast, AppBroadcastInput, AppBroadcastType } from "../../types/appBroadcast";
import { appBroadcastTypeLabel } from "../../types/appBroadcast";
import {
  DevActionBar,
  DevActionButton,
  DevErrorBanner,
  DevListItem,
  DevLoadingState,
  DevMasterDetail,
  DevMetaGrid,
  DevSidebar,
} from "./DevConsoleUi";

const TYPE_OPTIONS: AppBroadcastType[] = [
  "info",
  "warning",
  "maintenance",
  "essential",
];

function toLocalInputValue(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function defaultForm(): AppBroadcastInput {
  const start = new Date();
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    title: "",
    body: "",
    messageType: "maintenance",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    dismissible: true,
    enabled: true,
  };
}

function formFromBroadcast(item: AppBroadcast): AppBroadcastInput {
  return {
    title: item.title,
    body: item.body,
    messageType: item.messageType,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    dismissible: item.dismissible,
    enabled: item.enabled,
  };
}

function statusBadge(item: AppBroadcast) {
  const now = Date.now();
  const starts = Date.parse(item.startsAt);
  const ends = Date.parse(item.endsAt);
  if (!item.enabled) return { label: "Disattivo", tone: "neutral" as const };
  if (ends <= now) return { label: "Scaduto", tone: "neutral" as const };
  if (starts > now) return { label: "Programmato", tone: "accent" as const };
  return { label: "In corso", tone: "warm" as const };
}

function BroadcastForm({
  value,
  onChange,
  busy,
  onSave,
  onDelete,
  isNew,
}: {
  value: AppBroadcastInput;
  onChange: (next: AppBroadcastInput) => void;
  busy: boolean;
  onSave: () => void;
  onDelete?: () => void;
  isNew: boolean;
}) {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
            Titolo
          </span>
          <input
            value={value.title}
            onChange={(event) => onChange({ ...value, title: event.target.value })}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none focus:border-accent/40"
            placeholder="Es. Manutenzione server"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
            Messaggio
          </span>
          <textarea
            value={value.body}
            onChange={(event) => onChange({ ...value, body: event.target.value })}
            rows={5}
            className="w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] leading-relaxed text-text-primary outline-none focus:border-accent/40"
            placeholder="Descrivi il problema o la manutenzione..."
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
            Tipologia
          </span>
          <select
            value={value.messageType}
            onChange={(event) =>
              onChange({
                ...value,
                messageType: event.target.value as AppBroadcastType,
                dismissible:
                  event.target.value === "essential" ? false : value.dismissible,
              })
            }
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none focus:border-accent/40"
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {appBroadcastTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-end gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
            className="h-4 w-4 rounded border-white/20"
          />
          <span className="text-[13px] text-text-primary">Annuncio attivo</span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
            Inizio lavori
          </span>
          <input
            type="datetime-local"
            value={toLocalInputValue(value.startsAt)}
            onChange={(event) =>
              onChange({ ...value, startsAt: fromLocalInputValue(event.target.value) })
            }
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none focus:border-accent/40"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
            Fine lavori
          </span>
          <input
            type="datetime-local"
            value={toLocalInputValue(value.endsAt)}
            onChange={(event) =>
              onChange({ ...value, endsAt: fromLocalInputValue(event.target.value) })
            }
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-text-primary outline-none focus:border-accent/40"
          />
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:col-span-2">
          <input
            type="checkbox"
            checked={value.dismissible}
            disabled={value.messageType === "essential"}
            onChange={(event) =>
              onChange({ ...value, dismissible: event.target.checked })
            }
            className="h-4 w-4 rounded border-white/20 disabled:opacity-40"
          />
          <span className="text-[13px] text-text-primary">
            Chiudibile dall&apos;utente (disattivato per messaggi essenziali)
          </span>
        </label>
      </div>

      <DevActionBar>
        <DevActionButton
          tone="accent"
          onClick={onSave}
          disabled={busy || !value.title.trim() || !value.body.trim()}
          icon={busy ? Loader2 : Save}
        >
          {isNew ? "Pubblica annuncio" : "Salva modifiche"}
        </DevActionButton>
        {!isNew && onDelete && (
          <DevActionButton tone="danger" onClick={onDelete} disabled={busy} icon={Trash2}>
            Elimina
          </DevActionButton>
        )}
      </DevActionBar>
    </div>
  );
}

export function BroadcastAdminPanel() {
  const [items, setItems] = useState<AppBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppBroadcastInput>(defaultForm());
  const isNew = selectedId === "__new__";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchDevBroadcasts();
      setItems(rows);
      setSelectedId((prev) => {
        if (prev === "__new__") return prev;
        if (prev && rows.some((row) => row.id === prev)) return prev;
        return rows[0]?.id ?? "__new__";
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

  useEffect(() => {
    if (selectedId === "__new__") {
      setDraft(defaultForm());
      return;
    }
    const selected = items.find((item) => item.id === selectedId);
    if (selected) setDraft(formFromBroadcast(selected));
  }, [selectedId, items]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const liveCount = items.filter((item) => isBroadcastActiveNow(item)).length;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        dismissible: draft.messageType === "essential" ? false : draft.dismissible,
      };
      if (Date.parse(payload.endsAt) <= Date.parse(payload.startsAt)) {
        throw new Error("La fine lavori deve essere successiva all'inizio");
      }
      if (isNew) {
        const created = await createDevBroadcast(payload);
        await load();
        setSelectedId(created.id);
      } else if (selectedId) {
        await updateDevBroadcast(selectedId, payload);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selectedId || isNew) return;
    if (!window.confirm("Eliminare questo annuncio globale?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDevBroadcast(selectedId);
      await load();
      setSelectedId("__new__");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DevLoadingState />;

  return (
    <div className="page-px mx-auto mt-6 max-w-5xl">
      {error && (
        <div className="mb-4">
          <DevErrorBanner message={error} />
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[12px] text-text-secondary">
        Gli annunci vengono mostrati a <strong>tutti gli utenti</strong> con popup centrale e
        suono notifica. Chi non è online li vedrà alla prossima apertura dell&apos;app.
        {liveCount > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-warm">
            <Megaphone className="h-3.5 w-3.5" />
            {liveCount} annuncio/i attivo/i ora
          </span>
        )}
      </div>

      <DevMasterDetail
        sidebar={
          <DevSidebar title="Annunci globali">
            <div className="mb-2 px-1">
              <button
                type="button"
                onClick={() => setSelectedId("__new__")}
                className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] font-medium text-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                Nuovo annuncio
              </button>
            </div>
            {items.map((item) => {
              const badge = statusBadge(item);
              return (
                <DevListItem
                  key={item.id}
                  selected={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                  title={item.title}
                  subtitle={`${appBroadcastTypeLabel(item.messageType)} · ${badge.label}`}
                  meta={formatBroadcastWindow(item.startsAt, item.endsAt)}
                  leading={
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-text-muted">
                      {item.messageType === "maintenance" ? (
                        <Wrench className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </span>
                  }
                />
              );
            })}
          </DevSidebar>
        }
        detail={
          <div className="min-h-[420px] rounded-2xl border border-white/[0.08] bg-[#0a0a0c]">
            {selected && !isNew && (
              <div className="border-b border-white/[0.06] px-4 py-3 sm:px-6">
                <DevMetaGrid
                  items={[
                    { label: "Stato", value: statusBadge(selected).label },
                    { label: "Tipologia", value: appBroadcastTypeLabel(selected.messageType) },
                    {
                      label: "Finestra",
                      value: formatBroadcastWindow(selected.startsAt, selected.endsAt),
                    },
                  ]}
                />
              </div>
            )}
            <BroadcastForm
              value={draft}
              onChange={setDraft}
              busy={busy}
              onSave={() => void save()}
              onDelete={isNew ? undefined : () => void remove()}
              isNew={isNew}
            />
          </div>
        }
      />
    </div>
  );
}
