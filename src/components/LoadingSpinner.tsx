interface LoadingSpinnerProps {
  size?: "xs" | "sm" | "md";
  className?: string;
}

const sizeClass = {
  xs: "h-4 w-4 border",
  sm: "h-5 w-5 border-2",
  md: "h-6 w-6 border-2",
} as const;

export function LoadingSpinner({
  size = "sm",
  className = "",
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Caricamento"
      className={`animate-spin rounded-full border-white/15 border-t-white/70 ${sizeClass[size]} ${className}`}
    />
  );
}
