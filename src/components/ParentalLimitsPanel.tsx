import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useProfile } from "../context/ProfileContext";
import {
  getAddonAllowlist,
  listAllAddons,
  setAddonAllowlist,
} from "../lib/addonsApi";
import { STREMIO_ADDONS_ENABLED } from "../lib/features";
import {
  fetchProfileLimits,
  updateProfileLimits,
  type ProfileLimits,
} from "../lib/parentalApi";
import type { InstalledAddon } from "../types/stremio";

export function ParentalLimitsPanel({ parentProfileId }: { parentProfileId: string }) {
  const { profiles } = useProfile();
  const children = profiles.filter((p) => p.role === "child");
  const [selectedId, setSelectedId] = useState(children[0]?.id ?? "");
  const [limits, setLimits] = useState<ProfileLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allAddons, setAllAddons] = useState<InstalledAddon[]>([]);
  const [allowedAddonIds, setAllowedAddonIds] = useState<string[]>([]);
  const [allowlistSaving, setAllowlistSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const [data, addons, allowlist] = await Promise.all([
        fetchProfileLimits(selectedId),
        STREMIO_ADDONS_ENABLED ? listAllAddons(parentProfileId) : Promise.resolve([]),
        STREMIO_ADDONS_ENABLED
          ? getAddonAllowlist(parentProfileId, selectedId)
          : Promise.resolve([]),
      ]);
      setLimits(data);
      setAllAddons(addons.filter((a) => a.enabled));
      setAllowedAddonIds(allowlist);
    } finally {
      setLoading(false);
    }
  }, [selectedId, parentProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (children.length > 0 && !selectedId) {
      setSelectedId(children[0].id);
    }
  }, [children, selectedId]);

  const save = async (patch: {
    dailyLimitMins?: number;
    bedtimeStart?: string;
    bedtimeEnd?: string;
  }) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const next = await updateProfileLimits(parentProfileId, selectedId, patch);
      setLimits(next);
    } finally {
      setSaving(false);
    }
  };

  if (children.length === 0) {
    return (
      <p className="mt-2 text-[13px] text-text-muted">
        Crea un profilo bambino per impostare limiti di tempo.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => setSelectedId(child.id)}
            className={`rounded-full border px-3 py-1.5 text-[12px] ${
              selectedId === child.id
                ? "border-accent/40 bg-accent/10 text-text-primary"
                : "border-white/[0.08] text-text-muted"
            }`}
          >
            {child.name}
          </button>
        ))}
      </div>

      {loading || !limits ? (
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      ) : (
        <>
          <label className="block">
            <span className="text-[12px] text-text-muted">
              Limite giornaliero (minuti, 0 = illimitato)
            </span>
            <input
              type="number"
              min={0}
              max={600}
              value={limits.dailyLimitMins}
              disabled={saving}
              onChange={(e) =>
                setLimits({
                  ...limits,
                  dailyLimitMins: Number(e.target.value) || 0,
                })
              }
              onBlur={() =>
                void save({ dailyLimitMins: limits.dailyLimitMins })
              }
              className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] text-text-muted">Inizio niente TV</span>
              <input
                type="time"
                value={limits.bedtimeStart ?? ""}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, bedtimeStart: e.target.value })
                }
                onBlur={() =>
                  void save({
                    bedtimeStart: limits.bedtimeStart || "",
                    bedtimeEnd: limits.bedtimeEnd || "",
                  })
                }
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-text-muted">Fine niente TV</span>
              <input
                type="time"
                value={limits.bedtimeEnd ?? ""}
                disabled={saving}
                onChange={(e) =>
                  setLimits({ ...limits, bedtimeEnd: e.target.value })
                }
                onBlur={() =>
                  void save({
                    bedtimeStart: limits.bedtimeStart || "",
                    bedtimeEnd: limits.bedtimeEnd || "",
                  })
                }
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
              />
            </label>
          </div>

          {STREMIO_ADDONS_ENABLED && (
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-[13px] font-medium text-text-primary">
              Addon streaming consentiti
            </p>
            <p className="mt-1 text-[12px] text-text-muted">
              Solo gli addon selezionati compaiono in «In streaming» per questo
              bambino.
            </p>
            {allAddons.length === 0 ? (
              <p className="mt-3 text-[12px] text-text-muted">
                Installa prima degli addon nella sezione sopra.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {allAddons.map((addon) => {
                  const checked = allowedAddonIds.includes(addon.id);
                  return (
                    <label
                      key={addon.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={allowlistSaving}
                        onChange={() => {
                          const next = checked
                            ? allowedAddonIds.filter((id) => id !== addon.id)
                            : [...allowedAddonIds, addon.id];
                          setAllowedAddonIds(next);
                          setAllowlistSaving(true);
                          void setAddonAllowlist(
                            parentProfileId,
                            selectedId,
                            next,
                          ).finally(() => setAllowlistSaving(false));
                        }}
                        className="rounded border-white/20"
                      />
                      <span className="text-[13px] text-text-primary">{addon.name}</span>
                    </label>
                  );
                })}
              </ul>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
