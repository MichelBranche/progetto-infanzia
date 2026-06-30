import { useEffect, useRef, useState, type ReactNode } from "react";
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
  loading = "eager",
}: CoverImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);

    const img = imgRef.current;
    if (!img || !src) return;

    const markLoaded = () => {
      if (img.naturalWidth > 0) setLoaded(true);
    };

    if (img.complete) {
      markLoaded();
      return;
    }

    img.addEventListener("load", markLoaded);
    return () => img.removeEventListener("load", markLoaded);
  }, [src]);

  const showImage = Boolean(src) && !failed;
  const showSpinner = showImage && !loaded;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {showImage ? (
        <>
          <img
            ref={imgRef}
            src={src!}
            alt={alt}
            loading={loading}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`h-full w-full object-cover ${imgClassName}`}
          />
          {showSpinner && (
            <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/30">
              <LoadingSpinner size={spinnerSize} />
            </div>
          )}
        </>
      ) : (
        fallback
      )}
    </div>
  );
}
