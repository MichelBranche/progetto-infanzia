interface DevBackendOfflineScreenProps {
  checking?: boolean;
  onRetry: () => void;
}

export function DevBackendOfflineScreen({
  checking = false,
  onRetry,
}: DevBackendOfflineScreenProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#05000d] px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl backdrop-blur-md">
        <span className="chromatic-logo chromatic-logo--skew text-4xl">B</span>
        <h1 className="mt-5 font-display text-lg font-semibold text-white">
          Backend locale non raggiungibile
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Il browser è su{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/80">
            localhost:5173
          </code>{" "}
          ma l&apos;API Rust su{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/80">
            :8787
          </code>{" "}
          non risponde. Senza di essa la schermata resta nera dopo l&apos;intro.
        </p>
        <ol className="mt-4 space-y-2 text-left text-sm text-white/55">
          <li>
            1. Nel terminale, dalla root del progetto:{" "}
            <code className="text-white/75">npm run dev:browser</code>
          </li>
          <li>2. Attendi il messaggio API in ascolto su :8787 (prima compilazione ~30s)</li>
          <li>3. Ricarica questa pagina</li>
        </ol>
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:bg-white/90 disabled:opacity-60"
        >
          {checking ? "Controllo in corso…" : "Riprova connessione"}
        </button>
      </div>
    </div>
  );
}
