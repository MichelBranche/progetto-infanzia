import { ChevronRight, Monitor, Smartphone, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { MobilePromoMockups } from "./MobilePromoMockups";
import { APP_DOWNLOAD_URL } from "../lib/shareApp";
import { type PlatformPromoVariant } from "../lib/platformPromo";
import { openExternal } from "../lib/openExternal";
import {
  WEB_APP_INSTALL_PATH,
  webAppInstallPageUrl,
} from "../lib/webAppRoutes";

interface PlatformPromoBannerProps {
  variant: PlatformPromoVariant;
}

function MacBookMockup() {
  return (
    <div className="lf-platform-promo__macbook-wrap" aria-hidden>
      <img
        className="lf-platform-promo__device lf-platform-promo__device--macbook"
        src="/promo/macbook-mockup.png"
        alt=""
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function MobileDeviceMockups() {
  return <MobilePromoMockups />;
}

function GlassIconBadge({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: PlatformPromoVariant;
}) {
  return (
    <span
      className={`lf-platform-promo__icon-badge lf-platform-promo__icon-badge--${tone}`}
    >
      <Icon className="h-5 w-5" strokeWidth={2} />
    </span>
  );
}

const COPY = {
  "desktop-app": {
    badge: "App desktop",
    title: "Branchefy sul tuo Mac o PC",
    body: "Scarica l'app desktop per libreria locale, trasmissione alla TV, watch party in LAN e prestazioni migliori sul grande schermo.",
    cta: "Scarica per desktop",
    icon: Monitor,
  },
  "mobile-web": {
    badge: "Web app",
    title: "Branchefy su iPhone e iPad",
    body: "Aggiungi la web app alla Home: stessa esperienza streaming, profili e lista ovunque, senza store.",
    cta: "Guida installazione mobile",
    icon: Smartphone,
  },
} as const;

export function PlatformPromoBanner({ variant }: PlatformPromoBannerProps) {
  const content = COPY[variant];

  const handleClick = () => {
    if (variant === "desktop-app") {
      void openExternal(APP_DOWNLOAD_URL);
      return;
    }
    const installUrl = webAppInstallPageUrl();
    if (
      typeof window !== "undefined" &&
      installUrl.startsWith(window.location.origin)
    ) {
      window.location.href = WEB_APP_INSTALL_PATH;
      return;
    }
    void openExternal(installUrl);
  };

  return (
    <section className="page-px relative z-10 py-3 sm:py-4">
      <motion.button
        type="button"
        onClick={handleClick}
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.995 }}
        className="group w-full text-left"
      >
        <div
          className={`lf-platform-promo__card lf-platform-promo__card--${variant}`}
        >
          <div className="lf-platform-promo__sheen" aria-hidden />
          <div className="lf-platform-promo__tint" aria-hidden />
          <div className="lf-platform-promo__rim" aria-hidden />

          <div className="lf-platform-promo__content">
            <div className="min-w-0 max-w-xl">
              <div className="mb-3 flex items-center gap-3 sm:mb-4">
                <span
                  className={`lf-platform-promo__badge lf-platform-promo__badge--${variant}`}
                >
                  {content.badge}
                </span>
                <span
                  className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent"
                  aria-hidden
                />
              </div>

              <div className="flex items-start gap-4">
                <GlassIconBadge icon={content.icon} tone={variant} />
                <div className="min-w-0">
                  <h3 className="font-display text-[1.25rem] font-semibold tracking-[-0.03em] text-white/95 sm:text-[1.55rem]">
                    {content.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/62 sm:text-[14px]">
                    {content.body}
                  </p>
                  <span
                    className={`lf-platform-promo__cta lf-platform-promo__cta--${variant}`}
                  >
                    {content.cta}
                    <ChevronRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2.5}
                    />
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-center sm:justify-end">
              {variant === "desktop-app" ? (
                <MacBookMockup />
              ) : (
                <MobileDeviceMockups />
              )}
            </div>
          </div>
        </div>
      </motion.button>
    </section>
  );
}
