import { Volume2, VolumeX } from "lucide-react";

interface PreviewAudioToggleProps {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

export function PreviewAudioToggle({
  enabled,
  onToggle,
  className = "",
}: PreviewAudioToggleProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-black/65 ${className}`}
      title={enabled ? "Disattiva audio anteprime" : "Attiva audio anteprime"}
      aria-label={enabled ? "Disattiva audio anteprime" : "Attiva audio anteprime"}
      aria-pressed={enabled}
    >
      {enabled ? (
        <Volume2 className="h-4 w-4" />
      ) : (
        <VolumeX className="h-4 w-4" />
      )}
    </button>
  );
}
