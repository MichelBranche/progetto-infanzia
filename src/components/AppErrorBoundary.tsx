import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Evita schermo nero totale su crash React non gestiti. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  private reload = () => {
    window.location.assign(
      `${window.location.origin}${window.location.pathname || "/"}`,
    );
  };

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message =
      this.state.error.message?.trim() || "Errore inatteso nell’interfaccia.";

    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-auto bg-void px-6 py-12 text-center">
        <div className="noise-overlay pointer-events-none absolute inset-0 opacity-30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(107,127,255,0.12),transparent)]" />

        <div className="relative w-full max-w-md">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.04]">
            <span className="font-display text-[2rem] font-black italic tracking-[-0.06em] text-text-primary">
              B
            </span>
          </div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-text-primary">
            Qualcosa è andato storto
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
            L’app ha incontrato un errore. Puoi riprovare o ricaricare la pagina.
          </p>
          <p className="mt-4 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-text-muted">
            {message}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 px-5 py-3 text-[13px] font-semibold text-text-primary hover:bg-white/[0.04]"
            >
              Riprova
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-5 py-3 text-[13px] font-semibold text-black hover:opacity-90"
            >
              Ricarica
            </button>
          </div>
        </div>
      </div>
    );
  }
}
