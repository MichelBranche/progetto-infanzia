import { Loader2, WifiOff } from "lucide-react";
import { MediaRow } from "./MediaRow";
import { continueToPreview, streamingBrowseItem } from "../lib/streamingBrowse";
import type { StreamingRow } from "../lib/useStreamingCatalogs";
import type { StremioMetaPreview, StreamingContinueItem } from "../types/stremio";

interface StreamingHomeSectionProps {
  rows: StreamingRow[];
  continueItems: StreamingContinueItem[];
  loading: boolean;
  error: string | null;
  hasStreaming: boolean;
  rowIndexOffset: number;
  onPlayStreaming: (preview: StremioMetaPreview) => void;
}

export function StreamingHomeSection({
  rows,
  continueItems,
  loading,
  error,
  hasStreaming,
  rowIndexOffset,
  onPlayStreaming,
}: StreamingHomeSectionProps) {
  if (!hasStreaming) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (rows.length === 0 && continueItems.length === 0) {
    return (
      <div className="mx-8 my-8 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center sm:mx-12">
        <WifiOff className="h-6 w-6 text-text-muted" />
        <p className="text-[14px] text-text-secondary">
          Nessun catalogo streaming disponibile al momento.
        </p>
        {error ? (
          <p className="max-w-md text-[12px] text-red-300/80">{error}</p>
        ) : (
          <p className="max-w-md text-[12px] text-text-muted">
            Il catalogo Streaming Community è disponibile in Home. Controlla la
            connessione se non vedi titoli.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative z-10 space-y-1">
      {continueItems.length > 0 && (
        <MediaRow
          key="sc-continue"
          index={String(rowIndexOffset + 1).padStart(2, "0")}
          title="Riprendi a guardare"
          subtitle="Streaming in app"
          items={continueItems.map((item) =>
            streamingBrowseItem(continueToPreview(item)),
          )}
          onPlay={() => {}}
          onPlayStreaming={onPlayStreaming}
        />
      )}
      {rows.map((row, i) => (
        <MediaRow
          key={row.key}
          index={String(rowIndexOffset + (continueItems.length > 0 ? 1 : 0) + i + 1).padStart(2, "0")}
          title={row.title}
          subtitle={row.subtitle}
          items={row.items.map(streamingBrowseItem)}
          onPlay={() => {}}
          onPlayStreaming={onPlayStreaming}
        />
      ))}
    </div>
  );
}
