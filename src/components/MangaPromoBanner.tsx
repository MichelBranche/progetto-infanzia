import { BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import {
  SETTINGS_CARD,
  SettingsIconBadge,
} from "./settings/SettingsUi";

interface MangaPromoBannerProps {
  onExplore: () => void;
}

export function MangaPromoBanner({ onExplore }: MangaPromoBannerProps) {
  return (
    <section className="page-px relative z-10 py-3 sm:py-4">
      <motion.button
        type="button"
        onClick={onExplore}
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.995 }}
        className="group w-full text-left"
      >
        <div
          className={`${SETTINGS_CARD} border-lavender/20 shadow-[0_20px_56px_rgba(0,0,0,0.42),0_0_48px_rgba(167,139,250,0.08)] transition-all duration-300 group-hover:border-white/[0.12] group-hover:shadow-[0_24px_64px_rgba(0,0,0,0.48),0_0_56px_rgba(167,139,250,0.12)]`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-lavender/20 via-accent/10 to-transparent" />
          <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-lavender/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 left-1/3 h-36 w-36 rounded-full bg-accent/8 blur-3xl" />
          <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.06]" />

          <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 lg:p-7">
            <div className="min-w-0 max-w-2xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-lavender/25 bg-lavender/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-lavender">
                  <Sparkles className="h-3 w-3" strokeWidth={2.25} />
                  Novità
                </span>
                <span
                  className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent"
                  aria-hidden
                />
              </div>

              <div className="flex items-start gap-4">
                <SettingsIconBadge
                  icon={BookOpen}
                  className="border-lavender/25 bg-lavender/10 shadow-[0_0_24px_rgba(167,139,250,0.12)] [&_svg]:text-lavender"
                />
                <div className="min-w-0">
                  <h3 className="font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-text-primary sm:text-[1.65rem]">
                    Leggi i manga dentro Branchefy
                  </h3>
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-text-muted sm:text-[14px]">
                    Capitoli aggiornati, lettura verticale fluida e lista
                    personale. Scopri il nuovo servizio di lettura manga
                    integrato nell&apos;app.
                  </p>
                  <span className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-lavender/30 bg-lavender/10 px-5 py-2.5 text-[12px] font-semibold text-text-primary transition-all group-hover:border-lavender/45 group-hover:bg-lavender/15">
                    Esplora manga
                    <ChevronRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2.5}
                    />
                  </span>
                </div>
              </div>
            </div>

            <div className="hidden shrink-0 sm:flex sm:items-end sm:gap-2.5 lg:gap-3">
              {[0, 1, 2].map((slot) => (
                <div
                  key={slot}
                  className={`overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0c]/80 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-transform duration-300 group-hover:-translate-y-1 ${
                    slot === 1
                      ? "h-36 w-24 -rotate-6 group-hover:-rotate-3"
                      : slot === 0
                        ? "h-32 w-20 rotate-6 group-hover:rotate-3"
                        : "h-40 w-24 rotate-2 group-hover:rotate-0"
                  }`}
                >
                  <div className="relative flex h-full flex-col justify-end p-3">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-lavender/15 via-transparent to-accent/5" />
                    <BookOpen className="relative mb-auto h-5 w-5 text-lavender/45" />
                    <div className="relative space-y-1.5">
                      <div className="h-1 w-10 rounded-full bg-white/18" />
                      <div className="h-1 w-14 rounded-full bg-white/10" />
                      <div className="h-1 w-8 rounded-full bg-white/8" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.button>
    </section>
  );
}
