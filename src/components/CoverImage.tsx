import { useEffect, useState, type ReactNode } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

interface CoverImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallback?: ReactNode;
  spinnerSize?: "xs" | "sm" | "md";
  loading?: "lazy" | "eager";
}

export function CoverImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  fallback,
  spinnerSize = "sm",
  loading = "lazy",
}: CoverImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;
  const showSpinner = showImage && !loaded;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {showSpinner && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#14141c]">
          <LoadingSpinner size={spinnerSize} />
        </div>
      )}

      {showImage ? (
        <img
          src={src!}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          } ${imgClassName}`}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
