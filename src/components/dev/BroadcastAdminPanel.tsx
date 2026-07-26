import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Megaphone,
  Plus,
  Save,
  Send,
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
  SettingsButton,
  SettingsCheckboxRow,
  SettingsField,
  SettingsInput,
  SettingsPill,
} from "../settings/SettingsUi";
import {
  DevActionBar,
  DevActionButton,
  DevDetailPane,
  DevErrorBanner,
  DevInfoBanner,
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

const DURATION_PRESETS: Array<{ id: string; label: string; hours: number }> = [
  { id: "2h", label: "2 ore", hours: 2 },
  { id: "24h", label: "24 ore", hours: 24 },
  { id: "7d", label: "7 giorni", hours: 24 * 7 },
  { id: "30d", label: "30 giorni", hours: 24 * 30 },
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

function defaultForm(hours = 24): AppBroadcastInput {
  const start = new Date();
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return {
    title: "",
    body: "",
    messageType: "info",
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
  durationPreset,
  onDurationPreset,
}: {
  value: AppBroadcastInput;
  onChange: (next: AppBroadcastInput) => void;
  busy: boolean;
  onSave: () => void;
  onDelete?: () => void;
  isNew: boolean;
  durationPreset: string;
  onDurationPreset: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SettingsField label="Titolo" className="sm:col-span-2">
          <SettingsInput
            value={value.title}
            onChange={(event) => onChange({ ...value, title: event.target.value })}
            placeholder="Es. Novità su Branchefy"
          />
        </SettingsField>

        <SettingsField label="Messaggio" className="sm:col-span-2">
          <textarea
            value={value.body}
            onChange={(event) => onChange({ ...value, body: event.target.value })}
            rows={5}
            placeholder="Testo che vedranno tutti gli utenti nel popup…"
            className="w-full resize-y rounded-2xl border border-border bg-fill px-4 py-3 text-[14px] leading-relaxed text-text-primary outline-none transition-colors placeholder:text-text-muted/70 focus:border-border-hover focus:bg-fill-strong"
          />
        </SettingsField>

        <SettingsField label="Tipologia">
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
            className="w-full rounded-2xl border border-border bg-fill px-4 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-border-hover focus:bg-fill-strong"
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {appBroadcastTypeLabel(type)}
              </option>
            ))}
          </select>
        </SettingsField>

        <div className="flex items-end">
          <SettingsCheckboxRow
            checked={value.enabled}
            onChange={() => onChange({ ...value, enabled: !value.enabled })}
            label="Messaggio attivo"
          />
        </div>

        {isNew && (
          <div className="sm:col-span-2">
            <p className="mb-2 text-[12px] font-medium text-text-secondary">
              Durata (da ora)
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((preset) => (
                <SettingsPill
                  key={preset.id}
                  active={durationPreset === preset.id}
                  onClick={() => onDurationPreset(preset.id)}
                >
                  {preset.label}
                </SettingsPill>
              ))}
              <SettingsPill
                active={durationPreset === "custom"}
                onClick={() => onDurationPreset("custom")}
              >
                Personalizzata
              </SettingsPill>
            </div>
          </div>
        )}

        {(durationPreset === "custom" || !isNew) && (
          <>
            <SettingsField label="Inizio">
              <SettingsInput
                type="datetime-local"
                value={toLocalInputValue(value.startsAt)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    startsAt: fromLocalInputValue(event.target.value),
                  })
                }
              />
            </SettingsField>

            <SettingsField label="Fine">
              <SettingsInput
                type="datetime-local"
                value={toLocalInputValue(value.endsAt)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    endsAt: fromLocalInputValue(event.target.value),
                  })
                }
              />
            </SettingsField>
          </>
        )}

        <div className="sm:col-span-2">
          <SettingsCheckboxRow
            checked={value.dismissible}
            disabled={value.messageType === "essential"}
            onChange={() =>
              onChange({ ...value, dismissible: !value.dismissible })
            }
            label="Chiudibile dall'utente (disattivato per messaggi essenziali)"
          />
        </div>
      </div>

      <DevActionBar>
        <DevActionButton
          tone="accent"
          onClick={onSave}
          disabled={busy || !value.title.trim() || !value.body.trim()}
          icon={busy ? Loader2 : isNew ? Send : Save}
        >
          {isNew ? "Invia popup a tutti" : "Salva modifiche"}
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
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppBroadcastInput>(() => defaultForm(24));
  const [durationPreset, setDurationPreset] = useState("24h");
  const isNew = selectedId === "__new__";

  const applyDurationPreset = useCallback((id: string) => {
    setDurationPreset(id);
    if (id === "custom") return;
    const preset = DURATION_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setDraft((prev) => {
      const start = new Date();
      const end = new Date(start.getTime() + preset.hours * 60 * 60 * 1000);
      return {
        ...prev,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      };
    });
  }, []);

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
      setDraft(defaultForm(24));
      setDurationPreset("24h");
      return;
    }
    const selected = items.find((item) => item.id === selectedId);
    if (selected) {
      setDraft(formFromBroadcast(selected));
      setDurationPreset("custom");
    }
  }, [selectedId, items]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const liveCount = items.filter((item) => isBroadcastActiveNow(item)).length;

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        ...draft,
        dismissible: draft.messageType === "essential" ? false : draft.dismissible,
      };
      if (Date.parse(payload.endsAt) <= Date.parse(payload.startsAt)) {
        throw new Error("La fine deve essere successiva all'inizio");
      }
      if (isNew) {
        const created = await createDevBroadcast(payload);
        setMessage(
          "Popup inviato. Gli utenti online lo vedono subito; gli altri alla prossima apertura.",
        );
        await load();
        setSelectedId(created.id);
      } else if (selectedId) {
        await updateDevBroadcast(selectedId, payload);
        setMessage("Messaggio aggiornato.");
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
    if (!window.confirm("Eliminare questo messaggio globale?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
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
    <div className="space-y-4">
      {error && <DevErrorBanner message={error} />}
      {message && (
        <div className="rounded-2xl border border-mint/25 bg-mint/10 px-4 py-3 text-[13px] text-mint">
          {message}
        </div>
      )}

      <DevInfoBanner>
        I messaggi partono a nome di{" "}
        <strong className="text-text-primary">Amministrazione Branchefy</strong> e
        appaiono in popup centrale a tutti gli utenti (con suono). Chi non è online
        li vede alla prossima apertura dell&apos;app, finché restano attivi.
        {liveCount > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-warm">
            <Megaphone className="h-3.5 w-3.5" />
            {liveCount} attivo/i ora
          </span>
        )}
      </DevInfoBanner>

      <DevMasterDetail
        sidebar={
          <DevSidebar title="Messaggi inviati">
            <div className="mb-2 px-1">
              <SettingsButton
                variant="secondary"
                onClick={() => setSelectedId("__new__")}
                className="w-full px-3 py-2 text-[12px]"
              >
                <Plus className="h-3.5 w-3.5" />
                Nuovo messaggio
              </SettingsButton>
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-text-muted">
                Nessun messaggio ancora.
              </p>
            ) : (
              items.map((item) => {
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
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-fill-muted text-text-muted">
                        {item.messageType === "maintenance" ? (
                          <Wrench className="h-4 w-4" />
                        ) : item.messageType === "info" ? (
                          <Megaphone className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </span>
                    }
                  />
                );
              })
            )}
          </DevSidebar>
        }
        detail={
          <DevDetailPane>
            {selected && !isNew && (
              <div className="mb-5 border-b border-border pb-4">
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
            {isNew && (
              <p className="mb-4 text-[13px] text-text-muted">
                Scrivi titolo e testo, scegli quanto resta visibile, poi invia. Il
                popup mostra mittente <span className="text-text-secondary">Amministrazione Branchefy</span>.
              </p>
            )}
            <BroadcastForm
              value={draft}
              onChange={setDraft}
              busy={busy}
              onSave={() => void save()}
              onDelete={isNew ? undefined : () => void remove()}
              isNew={isNew}
              durationPreset={durationPreset}
              onDurationPreset={applyDurationPreset}
            />
          </DevDetailPane>
        }
      />
    </div>
  );
}
