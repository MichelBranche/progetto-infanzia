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
import {
  SettingsCheckboxRow,
  SettingsDivider,
  SettingsEmpty,
  SettingsField,
  SettingsInput,
  SettingsPill,
} from "./settings/SettingsUi";

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
      <SettingsEmpty>
        Crea un profilo bambino per impostare limiti di tempo.
      </SettingsEmpty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {children.map((child) => (
          <SettingsPill
            key={child.id}
            active={selectedId === child.id}
            onClick={() => setSelectedId(child.id)}
          >
            {child.name}
          </SettingsPill>
        ))}
      </div>

      {loading || !limits ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      ) : (
        <>
          <SettingsField label="Limite giornaliero (minuti, 0 = illimitato)">
            <SettingsInput
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
              onBlur={() => void save({ dailyLimitMins: limits.dailyLimitMins })}
            />
          </SettingsField>

          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsField label="Inizio niente TV">
              <SettingsInput
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
              />
            </SettingsField>
            <SettingsField label="Fine niente TV">
              <SettingsInput
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
              />
            </SettingsField>
          </div>

          {STREMIO_ADDONS_ENABLED && (
            <>
              <SettingsDivider className="my-5" />
              <div>
                <p className="font-display text-[14px] font-medium tracking-[-0.01em] text-text-primary">
                  Addon streaming consentiti
                </p>
                <p className="mt-1 text-[12px] text-text-muted">
                  Solo gli addon selezionati compaiono in «In streaming» per questo
                  bambino.
                </p>
                {allAddons.length === 0 ? (
                  <SettingsEmpty className="mt-3">
                    Installa prima degli addon nella sezione sopra.
                  </SettingsEmpty>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {allAddons.map((addon) => {
                      const checked = allowedAddonIds.includes(addon.id);
                      return (
                        <li key={addon.id}>
                          <SettingsCheckboxRow
                            checked={checked}
                            disabled={allowlistSaving}
                            label={addon.name}
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
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
