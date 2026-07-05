import { BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

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
        className="group relative w-full overflow-hidden rounded-2xl border border-violet-400/20 bg-[#120f1d] text-left shadow-[0_20px_60px_rgba(76,29,149,0.22)] ring-1 ring-white/[0.06] transition-transform duration-300 hover:scale-[1.01]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.28),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(244,114,182,0.18),transparent_50%)]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0d0a16]/95 via-[#120f1d]/80 to-transparent" />

        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 lg:p-7">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              Novità
            </div>
            <h3 className="font-display text-2xl font-bold tracking-[-0.03em] text-white sm:text-[1.75rem]">
              Leggi i manga dentro Branchefy
            </h3>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/72 sm:text-[15px]">
              Capitoli aggiornati, lettura verticale fluida e lista personale.
              Scopri il nuovo servizio di lettura manga integrato nell&apos;app.
            </p>
            <span className="mt-4 inline-flex items-center gap-2 text-[14px] font-semibold text-violet-200 transition-colors group-hover:text-white">
              Esplora manga
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>

          <div className="hidden shrink-0 sm:flex sm:items-end sm:gap-3">
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className={`overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-violet-950 via-fuchsia-950 to-slate-950 shadow-[0_16px_40px_rgba(0,0,0,0.35)] ${
                  slot === 1
                    ? "h-36 w-24 -rotate-6"
                    : slot === 0
                      ? "h-32 w-20 rotate-6"
                      : "h-40 w-24 rotate-3"
                }`}
              >
                <div className="flex h-full flex-col justify-end p-3">
                  <BookOpen className="mb-auto h-5 w-5 text-white/35" />
                  <div className="h-1.5 w-10 rounded-full bg-white/20" />
                  <div className="mt-1.5 h-1.5 w-14 rounded-full bg-white/12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.button>
    </section>
  );
}
