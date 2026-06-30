import { Home, ExternalLink } from "lucide-react";
import { STREAMING_SERVICES, streamingSearchUrl, serviceById } from "../data/streaming";

interface StreamingBadgesProps {
  title: string;
  streamingServices?: string[];
  subscribedServices?: string[];
  compact?: boolean;
  showInLibrary?: boolean;
}

export function StreamingBadges({
  title,
  streamingServices = [],
  subscribedServices = [],
  compact = false,
  showInLibrary = true,
}: StreamingBadgesProps) {
  const visible = streamingServices.filter((id) =>
    subscribedServices.length === 0 ? true : subscribedServices.includes(id),
  );

  if (!showInLibrary && visible.length === 0) return null;

  const open = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "mt-2"}`}>
      {showInLibrary && (
        <span className="inline-flex items-center gap-1 rounded-full border border-mint/30 bg-mint/10 px-2 py-0.5 text-[10px] font-medium text-mint">
          <Home className="h-3 w-3" />
          In casa
        </span>
      )}
      {visible.map((id) => {
        const service = serviceById(id);
        if (!service) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open(streamingSearchUrl(id, title));
            }}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-text-secondary transition-colors hover:border-white/20 hover:text-text-primary"
            title={`Cerca su ${service.label}`}
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ backgroundColor: service.color }}
            >
              {service.shortLabel.charAt(0)}
            </span>
            {compact ? service.shortLabel : service.label}
            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
          </button>
        );
      })}
      {subscribedServices.length === 0 && streamingServices.length > 0 && (
        <span className="text-[10px] text-text-muted">
          Attiva gli abbonamenti in Impostazioni
        </span>
      )}
    </div>
  );
}

export function StreamingServicePicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {STREAMING_SERVICES.map((service) => {
        const active = selected.includes(service.id);
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => toggle(service.id)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              active
                ? "border-accent/40 bg-accent/10 text-text-primary"
                : "border-white/[0.08] text-text-muted hover:border-white/15"
            }`}
          >
            {service.label}
          </button>
        );
      })}
    </div>
  );
}
