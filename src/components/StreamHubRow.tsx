import { motion } from "framer-motion";

interface HubTile {
  id: string;
  label: string;
  subtitle: string;
  cover: string;
  glow: string;
}

const HUB_TILES: HubTile[] = [
  {
    id: "cartoni",
    label: "Cartoni",
    subtitle: "Archivio",
    cover: "/hub/copertina-cartoni.png",
    glow: "group-hover:shadow-[0_0_40px_rgba(239,68,68,0.32)]",
  },
  {
    id: "film",
    label: "Film",
    subtitle: "Cinema",
    cover: "/hub/copertina-film.png",
    glow: "group-hover:shadow-[0_0_40px_rgba(251,146,60,0.28)]",
  },
  {
    id: "serie",
    label: "Serie TV",
    subtitle: "Episodi",
    cover: "/hub/copertina-serie.png",
    glow: "group-hover:shadow-[0_0_40px_rgba(56,189,248,0.25)]",
  },
  {
    id: "anime",
    label: "Anime",
    subtitle: "Saturn",
    cover: "/hub/copertina-anime.png",
    glow: "group-hover:shadow-[0_0_40px_rgba(217,70,239,0.3)]",
  },
  {
    id: "capsula",
    label: "Capsula",
    subtitle: "Classici",
    cover: "/hub/copertina-capsula.png",
    glow: "group-hover:shadow-[0_0_40px_rgba(52,211,153,0.22)]",
  },
];

interface StreamHubRowProps {
  onNavigate: (sectionId: string) => void;
}

const tileMotion = {
  hidden: { opacity: 0, y: 20, scale: 0.94 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.06,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

export function StreamHubRow({ onNavigate }: StreamHubRowProps) {
  return (
    <section className="page-px row-pointer-pass relative z-10 -mt-2 py-4 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-4 sm:mb-5"
      >
        <p className="font-display text-[11px] tabular-nums text-text-muted sm:text-xs">
          00
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold tracking-[-0.025em] text-text-primary sm:text-2xl">
          Esplora per categoria
        </h2>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {HUB_TILES.map((tile, index) => (
          <motion.button
            key={tile.id}
            type="button"
            custom={index}
            variants={tileMotion}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-20px" }}
            whileHover={{ scale: 1.03, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate(tile.id)}
            aria-label={`${tile.label} · ${tile.subtitle}`}
            className={`group relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#0d0d12] text-left ring-1 ring-white/[0.08] transition-shadow duration-500 ${tile.glow}`}
          >
            <img
              src={tile.cover}
              alt=""
              loading={index < 2 ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />
          </motion.button>
        ))}
      </div>
    </section>
  );
}
