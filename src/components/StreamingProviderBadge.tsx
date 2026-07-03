interface StreamingProviderBadgeProps {
  catalogPrefix?: string;
  className?: string;
}

/** Wordmark stile HBO Max in basso a destra sulla thumbnail. */
export function StreamingProviderBadge({
  catalogPrefix,
  className = "",
}: StreamingProviderBadgeProps) {
  const base =
    "pointer-events-none select-none font-bold leading-none tracking-tight text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]";

  if (catalogPrefix === "sc") {
    return (
      <div className={`${base} ${className}`}>
        <span className="block text-[8px] font-semibold uppercase tracking-[0.14em] opacity-90">
          Streaming
        </span>
        <span className="block text-[11px] font-bold lowercase">community</span>
      </div>
    );
  }

  if (catalogPrefix === "saturn") {
    return (
      <span className={`${base} text-[12px] font-bold lowercase ${className}`}>
        saturn
      </span>
    );
  }

  if (catalogPrefix === "loonex") {
    return (
      <span className={`${base} text-[12px] font-bold lowercase ${className}`}>
        loonex
      </span>
    );
  }

  return (
    <span className={`${base} text-[10px] font-semibold uppercase tracking-wider ${className}`}>
      Web
    </span>
  );
}
