import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Play, Search } from "lucide-react";
import {
  fetchAddonCatalog,
  fetchAddonMeta,
  listAddons,
} from "../lib/addonsApi";
import type { AddonWatchTarget } from "../lib/streamingBrowse";
import type {
  InstalledAddon,
  StremioMeta,
  StremioMetaPreview,
} from "../types/stremio";

interface StreamingPageProps {
  profileId: string;
  focusMeta?: { contentType: string; metaId: string } | null;
  onFocusHandled?: () => void;
  onStartWatch: (target: AddonWatchTarget) => void;
}

function catalogAddons(addons: InstalledAddon[]) {
  return addons.filter(
    (a) => a.enabled && a.resources.includes("catalog") && a.catalogs.length > 0,
  );
}

export function StreamingPage({
  profileId,
  focusMeta,
  onFocusHandled,
  onStartWatch,
}: StreamingPageProps) {
  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAddonId, setSelectedAddonId] = useState<string>("");
  const [selectedCatalogKey, setSelectedCatalogKey] = useState<string>("");
  const [items, setItems] = useState<StremioMetaPreview[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [detail, setDetail] = useState<StremioMeta | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const catalogSources = useMemo(() => catalogAddons(addons), [addons]);

  const selectedAddon = catalogSources.find((a) => a.id === selectedAddonId);
  const selectedCatalog = selectedAddon?.catalogs.find(
    (c) => `${c.type}::${c.id}` === selectedCatalogKey,
  );

  const supportsSearch = selectedCatalog?.extra?.some((e) => e.name === "search");

  const loadAddons = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAddons(profileId);
      setAddons(data);
      const sources = catalogAddons(data);
      if (sources.length > 0) {
        setSelectedAddonId((prev) => prev || sources[0].id);
        const first = sources[0].catalogs[0];
        if (first) {
          setSelectedCatalogKey(`${first.type}::${first.id}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void loadAddons();
  }, [loadAddons]);

  const loadCatalog = useCallback(async () => {
    if (!selectedAddon || !selectedCatalog) return;
    setCatalogLoading(true);
    setError(null);
    try {
      const extra: Record<string, string> = {};
      if (searchQuery.trim() && supportsSearch) {
        extra.search = searchQuery.trim();
      }
      const metas = await fetchAddonCatalog(
        profileId,
        selectedAddon.id,
        selectedCatalog.type,
        selectedCatalog.id,
        extra,
      );
      setItems(metas);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [
    profileId,
    searchQuery,
    selectedAddon,
    selectedCatalog,
    supportsSearch,
  ]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const openDetail = async (preview: StremioMetaPreview) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const meta = await fetchAddonMeta(profileId, preview.type, preview.id);
      setDetail(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!focusMeta) return;
    void (async () => {
      setDetailLoading(true);
      setDetail(null);
      try {
        const meta = await fetchAddonMeta(
          profileId,
          focusMeta.contentType,
          focusMeta.metaId,
        );
        setDetail(meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
        onFocusHandled?.();
      }
    })();
  }, [focusMeta, profileId, onFocusHandled]);

  const playVideo = (meta: StremioMeta, videoId: string) => {
    onStartWatch({
      contentType: meta.type,
      metaId: meta.id,
      videoId,
    });
  };

  const videosForMeta = (meta: StremioMeta) => {
    if (meta.videos.length > 0) return meta.videos;
    return [{ id: meta.id, title: meta.name }];
  };

  return (
    <div className="px-6 pb-16 pt-24">
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : catalogSources.length === 0 ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-[15px] text-text-primary">Nessun catalogo disponibile</p>
          <p className="mt-2 text-[13px] text-text-muted">
            {addons.length === 0
              ? "Chiedi a un genitore di installare almeno un addon Stremio (es. Cinemeta) dalle Impostazioni."
              : "Gli addon installati non espongono cataloghi, oppure il tuo profilo non ha addon autorizzati."}
          </p>
        </div>
      ) : detail ? (
        <div>
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="mb-4 inline-flex items-center gap-2 text-[13px] text-text-muted hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna al catalogo
          </button>

          {detailLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row">
              {detail.poster && (
                <img
                  src={detail.poster}
                  alt=""
                  className="h-56 w-40 shrink-0 rounded-xl object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-medium text-text-primary">{detail.name}</h2>
                {detail.releaseInfo && (
                  <p className="mt-1 text-[13px] text-text-muted">{detail.releaseInfo}</p>
                )}
                {detail.description && (
                  <p className="mt-3 text-[14px] leading-relaxed text-text-muted">
                    {detail.description}
                  </p>
                )}
                <div className="mt-6 space-y-2">
                  {videosForMeta(detail).map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => playVideo(detail, video.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left hover:border-accent/30"
                    >
                      <Play className="h-4 w-4 shrink-0 text-accent" />
                      <span className="text-[14px] text-text-primary">
                        {video.season != null && video.episode != null
                          ? `S${video.season}E${video.episode} · ${video.title}`
                          : video.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {catalogSources.map((addon) => (
              <button
                key={addon.id}
                type="button"
                onClick={() => {
                  setSelectedAddonId(addon.id);
                  const cat = addon.catalogs[0];
                  if (cat) setSelectedCatalogKey(`${cat.type}::${cat.id}`);
                }}
                className={`rounded-full border px-3 py-1.5 text-[12px] ${
                  selectedAddonId === addon.id
                    ? "border-accent/40 bg-accent/10 text-text-primary"
                    : "border-white/[0.08] text-text-muted"
                }`}
              >
                {addon.name}
              </button>
            ))}
          </div>

          {selectedAddon && selectedAddon.catalogs.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {selectedAddon.catalogs.map((cat) => {
                const key = `${cat.type}::${cat.id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedCatalogKey(key)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] ${
                      selectedCatalogKey === key
                        ? "border-white/20 bg-white/[0.06] text-text-primary"
                        : "border-white/[0.06] text-text-muted"
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          )}

          {supportsSearch && (
            <form
              className="mb-6 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSearchQuery(search);
              }}
            >
              <input
                value={search}
                onChange={(ev) => setSearch(ev.target.value)}
                placeholder="Cerca titoli…"
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] outline-none focus:border-accent/30"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-text-primary px-4 py-2 text-[12px] font-medium text-void"
              >
                <Search className="h-4 w-4" />
                Cerca
              </button>
            </form>
          )}

          {error && (
            <p className="mb-4 text-[13px] text-red-400/90">{error}</p>
          )}

          {catalogLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : (
            <div className="browse-grid">
              {items.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  onClick={() => void openDetail(item)}
                  className="group text-left"
                >
                  <div className="aspect-[2/3] overflow-hidden rounded-xl bg-white/[0.04]">
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-3 text-center text-[12px] text-text-muted">
                        {item.name}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] text-text-primary">
                    {item.name}
                  </p>
                  {item.releaseInfo && (
                    <p className="text-[11px] text-text-muted">{item.releaseInfo}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
