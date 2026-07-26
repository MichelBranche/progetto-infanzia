import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Globe,
  MessageSquare,
  Radio,
  UserPlus,
  Users,
} from "lucide-react";
import type { DevCloudUser } from "../../types/devAdmin";
import type { AppFeedbackRecord } from "../../types/feedback";
import {
  buildDaySeries,
  buildPlatformSlices,
  buildPresenceSlices,
  computeDevOverviewKpis,
  computeWebShellMetrics,
  type DayBucket,
  type PresenceSlice,
} from "../../lib/devDashboardMetrics";
import {
  fetchVercelWebAnalytics,
  type VercelAnalyticsSnapshot,
} from "../../lib/vercelAnalyticsApi";
import { SETTINGS_CARD } from "../settings/SettingsUi";
import { DevStatsGrid } from "./DevConsoleUi";

function maxOf(values: number[]): number {
  return Math.max(1, ...values);
}

function AreaChart({
  series,
  accent = "var(--color-text-primary)",
  secondary = "color-mix(in srgb, var(--color-text-primary) 35%, transparent)",
}: {
  series: DayBucket[];
  accent?: string;
  secondary?: string;
}) {
  const width = 560;
  const height = 180;
  const padX = 12;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const peak = maxOf(series.flatMap((d) => [d.newUsers, d.newProfiles]));
  const n = Math.max(1, series.length - 1);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const point = (index: number, value: number) => {
    const x = padX + (index / n) * innerW;
    const y = padY + innerH - (value / peak) * innerH;
    return { x, y };
  };

  const toPath = (key: "newUsers" | "newProfiles") => {
    if (series.length === 0) return "";
    return series
      .map((d, i) => {
        const { x, y } = point(i, d[key]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const toArea = (key: "newUsers" | "newProfiles") => {
    const line = toPath(key);
    if (!line || series.length === 0) return "";
    const first = point(0, series[0][key]);
    const last = point(series.length - 1, series[series.length - 1][key]);
    return `${line} L${last.x.toFixed(1)} ${(padY + innerH).toFixed(1)} L${first.x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;
  };

  const ticks = series.filter(
    (_, i) => i % Math.ceil(series.length / 6) === 0 || i === series.length - 1,
  );

  const hover = hoverIndex != null ? series[hoverIndex] : null;
  const hoverX = hoverIndex != null ? point(hoverIndex, 0).x : 0;
  const hoverUsers = hoverIndex != null ? point(hoverIndex, series[hoverIndex].newUsers) : null;
  const hoverProfiles =
    hoverIndex != null ? point(hoverIndex, series[hoverIndex].newProfiles) : null;

  const resolveIndexFromClientX = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || series.length === 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const svgX = ratio * width;
    const clamped = Math.min(Math.max(svgX, padX), width - padX);
    const idx = Math.round(((clamped - padX) / innerW) * n);
    setHoverIndex(Math.min(Math.max(idx, 0), series.length - 1));
  };

  const tooltipLeftPct = hoverIndex != null ? (hoverX / width) * 100 : 0;
  const tooltipSide = tooltipLeftPct > 72 ? "right" : "left";

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full cursor-crosshair touch-none"
        role="img"
        aria-label="Nuovi utenti e profili"
        onPointerMove={resolveIndexFromClientX}
        onPointerEnter={resolveIndexFromClientX}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = padY + innerH * (1 - t);
          return (
            <line
              key={t}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}
        <path d={toArea("newUsers")} fill={accent} fillOpacity={0.12} />
        <path
          d={toPath("newUsers")}
          fill="none"
          stroke={accent}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={toPath("newProfiles")}
          fill="none"
          stroke={secondary}
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {ticks.map((d) => {
          const idx = series.indexOf(d);
          const { x } = point(idx, 0);
          return (
            <text
              key={d.key}
              x={x}
              y={height - 2}
              textAnchor="middle"
              className="fill-current"
              style={{ fontSize: 10, opacity: 0.45 }}
            >
              {d.label}
            </text>
          );
        })}

        {hover && hoverUsers && hoverProfiles && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              x2={hoverX}
              y1={padY}
              y2={padY + innerH}
              stroke="currentColor"
              strokeOpacity={0.28}
              strokeWidth={1.25}
              strokeDasharray="3 3"
            />
            <circle cx={hoverUsers.x} cy={hoverUsers.y} r={4.5} fill={accent} />
            <circle
              cx={hoverUsers.x}
              cy={hoverUsers.y}
              r={8}
              fill={accent}
              fillOpacity={0.18}
            />
            <circle cx={hoverProfiles.x} cy={hoverProfiles.y} r={4} fill={secondary} />
            <circle
              cx={hoverProfiles.x}
              cy={hoverProfiles.y}
              r={7}
              fill={secondary}
              fillOpacity={0.2}
            />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[9.5rem] rounded-xl border border-border bg-panel/95 px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-md"
          style={
            tooltipSide === "left"
              ? { left: `min(${tooltipLeftPct}%, calc(100% - 10.5rem))` }
              : { right: `min(${100 - tooltipLeftPct}%, calc(100% - 10.5rem))` }
          }
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {hover.label}
          </p>
          <dl className="mt-1.5 space-y-1 text-[12px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-1.5 text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-text-primary" />
                Auth
              </dt>
              <dd className="font-semibold tabular-nums text-text-primary">
                {hover.newUsers}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-1.5 text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-text-primary/40" />
                Profili
              </dt>
              <dd className="font-semibold tabular-nums text-text-primary">
                {hover.newProfiles}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function DonutChart({ slices }: { slices: PresenceSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0) || 1;
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.08}
          strokeWidth={stroke}
        />
        {slices.map((slice) => {
          const len = (slice.count / total) * c;
          const el = (
            <circle
              key={slice.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          className="fill-current font-display"
          style={{ fontSize: 28, fontWeight: 700 }}
        >
          {(slices.find((s) => s.id === "online")?.count ?? 0) +
            (slices.find((s) => s.id === "away")?.count ?? 0)}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          className="fill-current"
          style={{ fontSize: 11, opacity: 0.55 }}
        >
          app aperte
        </text>
      </svg>
      <ul className="w-full space-y-2">
        {slices.map((slice) => (
          <li key={slice.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2 text-text-secondary">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: slice.color }}
              />
              {slice.label}
            </span>
            <span className="font-semibold tabular-nums text-text-primary">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarList({
  items,
}: {
  items: { label: string; count: number }[];
}) {
  const peak = maxOf(items.map((i) => i.count));
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-text-muted">
        Nessun dato piattaforma ancora.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="text-text-secondary">{item.label}</span>
            <span className="font-semibold tabular-nums text-text-primary">{item.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-fill-strong">
            <div
              className="h-full rounded-full bg-text-primary transition-[width] duration-500"
              style={{ width: `${Math.max(4, (item.count / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DevOverviewPanel({
  cloudUsers,
  feedbackItems,
  localProfileCount,
  lastUpdatedAt,
  live,
}: {
  cloudUsers: DevCloudUser[];
  feedbackItems: AppFeedbackRecord[];
  localProfileCount: number;
  lastUpdatedAt: number | null;
  live: boolean;
}) {
  const kpis = useMemo(
    () => computeDevOverviewKpis(cloudUsers, feedbackItems, localProfileCount),
    [cloudUsers, feedbackItems, localProfileCount],
  );
  const daySeries = useMemo(() => buildDaySeries(cloudUsers, 14), [cloudUsers]);
  const presence = useMemo(() => buildPresenceSlices(cloudUsers), [cloudUsers]);
  const platforms = useMemo(() => buildPlatformSlices(cloudUsers), [cloudUsers]);
  const webMetrics = useMemo(() => computeWebShellMetrics(cloudUsers), [cloudUsers]);
  const [vercel, setVercel] = useState<VercelAnalyticsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchVercelWebAnalytics().then((snapshot) => {
      if (!cancelled) setVercel(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [lastUpdatedAt]);

  const weekNew = daySeries.reduce((sum, d) => sum + d.newUsers, 0);
  const weekProfiles = daySeries.reduce((sum, d) => sum + d.newProfiles, 0);

  const updatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-text-muted">
          Ultimo aggiornamento <span className="tabular-nums text-text-secondary">{updatedLabel}</span>
        </p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            live
              ? "border-mint/30 bg-mint/10 text-mint"
              : "border-border bg-fill-muted text-text-muted"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-mint" : "bg-text-muted"}`} />
          {live ? "Live · refresh 20s" : "In pausa"}
        </span>
      </div>

      <DevStatsGrid
        stats={[
          { label: "Utenti auth", value: kpis.totalUsers, icon: Users },
          { label: "App aperte", value: kpis.online, icon: Radio },
          { label: "Utenti web", value: webMetrics.webUsers, icon: Globe },
          { label: "Web aperti", value: webMetrics.webOpen, icon: Globe },
          { label: "Nuovi (7g)", value: kpis.newThisWeek, icon: UserPlus },
          { label: "Feedback aperti", value: kpis.openFeedback, icon: MessageSquare },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <section className={`${SETTINGS_CARD} p-5 sm:p-6 lg:col-span-3`}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
                Nuovi utenti
              </h3>
              <p className="mt-0.5 text-[12px] text-text-muted">
                Ultimi 14 giorni · auth e profili app
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-text-primary" />
                Auth {weekNew}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-text-primary/40" />
                Profili {weekProfiles}
              </span>
            </div>
          </div>
          <div className="text-text-primary">
            <AreaChart series={daySeries} />
          </div>
        </section>

        <section className={`${SETTINGS_CARD} p-5 sm:p-6 lg:col-span-2`}>
          <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
            Presenza live
          </h3>
          <p className="mt-0.5 mb-4 text-[12px] text-text-muted">
            Solo heartbeat recente (&lt; 90s) = app effettivamente aperta
          </p>
          <DonutChart slices={presence} />
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${SETTINGS_CARD} p-5 sm:p-6`}>
          <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
            Piattaforme
          </h3>
          <p className="mt-0.5 mb-4 text-[12px] text-text-muted">
            Utenti con profilo e piattaforma nota
          </p>
          <BarList items={platforms} />
        </section>

        <section className={`${SETTINGS_CARD} p-5 sm:p-6`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
                Versione web
              </h3>
              <p className="mt-0.5 text-[12px] text-text-muted">
                Utenti con heartbeat da browser (non desktop Tauri)
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-fill-strong text-text-primary">
              <Globe className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            {[
              { label: "Utenti web", value: webMetrics.webUsers },
              { label: "Web aperti ora", value: webMetrics.webOpen },
              { label: "Web desktop", value: webMetrics.webDesktopBrowser },
              { label: "Web mobile", value: webMetrics.webMobile },
              { label: "Desktop app", value: webMetrics.desktopUsers },
              { label: "Shell sconosciuta", value: webMetrics.unknownShell },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-2xl border border-border bg-fill-muted px-3.5 py-3"
              >
                <dt className="text-[11px] text-text-muted">{row.label}</dt>
                <dd className="font-display mt-1 text-[1.35rem] font-semibold tabular-nums tracking-[-0.03em] text-text-primary">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className={`${SETTINGS_CARD} p-5 sm:p-6`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
              Vercel Web Analytics
            </h3>
            <p className="mt-0.5 text-[12px] text-text-muted">
              Traffico della web app su Vercel (pageview / visitatori)
            </p>
          </div>
        </div>

        {!vercel && (
          <p className="text-[13px] text-text-muted">Caricamento analytics…</p>
        )}

        {vercel && !vercel.configured && (
          <div className="rounded-2xl border border-border bg-fill-muted px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
            <p className="font-medium text-text-primary">Non configurato</p>
            <p className="mt-1">
              {vercel.hint ??
                "Aggiungi su Vercel: VERCEL_API_TOKEN, VERCEL_PROJECT_ID e VERCEL_TEAM_ID."}
            </p>
            <p className="mt-2 text-[12px] text-text-muted">
              Il token si crea in Vercel → Account Settings → Tokens. Project ID e Team ID
              sono in Project Settings.
            </p>
          </div>
        )}

        {vercel?.error && vercel.configured && (
          <div className="rounded-2xl border border-warm/25 bg-warm/10 px-4 py-3 text-[13px] text-warm">
            {vercel.error}
          </div>
        )}

        {vercel?.configured && !vercel.error && vercel.totals && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Visitatori 24h", value: vercel.totals.visitors24h },
              { label: "Pageview 24h", value: vercel.totals.pageviews24h },
              { label: "Visitatori 7g", value: vercel.totals.visitors7d },
              { label: "Pageview 7g", value: vercel.totals.pageviews7d },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-2xl border border-border bg-fill-muted px-3.5 py-3"
              >
                <dt className="text-[11px] text-text-muted">{row.label}</dt>
                <dd className="font-display mt-1 text-[1.35rem] font-semibold tabular-nums tracking-[-0.03em] text-text-primary">
                  {row.value == null ? "—" : row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${SETTINGS_CARD} p-5 sm:p-6 md:col-span-2`}>
          <h3 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">
            Snapshot
          </h3>
          <p className="mt-0.5 mb-4 text-[12px] text-text-muted">
            Sintesi rapida del momento
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "App aperte ora", value: kpis.presenceLive },
              { label: "Nuovi oggi", value: kpis.newToday },
              { label: "Solo auth", value: kpis.authOnly },
              { label: "Profili locali", value: kpis.localProfiles },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-2xl border border-border bg-fill-muted px-3.5 py-3"
              >
                <dt className="text-[11px] text-text-muted">{row.label}</dt>
                <dd className="font-display mt-1 text-[1.35rem] font-semibold tabular-nums tracking-[-0.03em] text-text-primary">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
