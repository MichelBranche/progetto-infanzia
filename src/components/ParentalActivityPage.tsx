import { useCallback, useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { useProfile } from "../context/ProfileContext";
import { fetchWatchHistory } from "../lib/parentalApi";
import type { WatchSession } from "../lib/parentalApi";
import { formatDuration } from "../types/media";

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ParentalActivityPage() {
  const { activeProfile, profiles } = useProfile();
  const childProfiles = profiles.filter((p) => p.role === "child");
  const [selectedChildId, setSelectedChildId] = useState(
    childProfiles[0]?.id ?? "",
  );
  const [sessions, setSessions] = useState<WatchSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeProfile || !selectedChildId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchWatchHistory(
        activeProfile.id,
        selectedChildId,
        50,
      );
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, selectedChildId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (childProfiles.length > 0 && !selectedChildId) {
      setSelectedChildId(childProfiles[0].id);
    }
  }, [childProfiles, selectedChildId]);

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <div className="mb-8 flex items-center gap-3">
        <Shield className="h-5 w-5 text-accent" />
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Attività bambini
          </h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            Cronologia di visione per profilo bambino
          </p>
        </div>
      </div>

      {childProfiles.length === 0 ? (
        <p className="text-[14px] text-text-muted">
          Nessun profilo bambino configurato.
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {childProfiles.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => setSelectedChildId(child.id)}
                className={`rounded-full border px-4 py-2 text-[12px] transition-colors ${
                  selectedChildId === child.id
                    ? "border-accent/40 bg-accent/10 text-text-primary"
                    : "border-white/[0.08] text-text-muted hover:border-white/15"
                }`}
              >
                {child.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-[14px] text-text-muted">Nessuna visione registrata.</p>
          ) : (
            <div className="max-w-3xl space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="title-clip text-[14px] font-medium text-text-primary">
                      {session.mediaTitle}
                      {session.sourceKind === "addon" && (
                        <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-normal text-accent">
                          streaming
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-text-muted">
                      {formatSessionDate(session.startedAt)}
                      {session.completed ? " · Completato" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-text-secondary">
                    {formatDuration(session.secondsWatched) ?? "0m"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
