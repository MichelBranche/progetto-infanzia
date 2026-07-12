import {
  webAppInstallVideoThumbnailUrl,
  webAppInstallVideoWatchUrl,
} from "../lib/webAppRoutes";

interface YouTubeShortLinkProps {
  title: string;
  className?: string;
}

export function YouTubeShortLink({ title, className = "" }: YouTubeShortLinkProps) {
  const watchUrl = webAppInstallVideoWatchUrl();

  return (
    <div className={className}>
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="lf-webapp-install__video-poster group"
        aria-label={`Guarda su YouTube: ${title}`}
      >
        <img
          src={webAppInstallVideoThumbnailUrl()}
          alt=""
          className="lf-webapp-install__video-poster-img"
          loading="lazy"
          decoding="async"
        />
        <span className="lf-webapp-install__video-poster-overlay" />
        <span className="lf-webapp-install__video-poster-content">
          <span className="lf-webapp-install__video-poster-play">
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="lf-webapp-install__video-poster-label">Guarda su YouTube</span>
        </span>
      </a>
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="lf-webapp-install__video-fallback"
      >
        Apri il tutorial video
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          aria-hidden
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
        </svg>
      </a>
    </div>
  );
}
