import { LoadingSpinner } from "./LoadingSpinner";

interface PreviewLoadingOverlayProps {
  show: boolean;
}

export function PreviewLoadingOverlay({ show }: PreviewLoadingOverlayProps) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/40">
      <LoadingSpinner size="sm" />
    </div>
  );
}
