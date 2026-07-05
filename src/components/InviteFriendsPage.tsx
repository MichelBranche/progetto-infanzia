import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Cloud,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  UserPlus,
  Wifi,
} from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import { APP_DOWNLOAD_URL } from "../lib/shareApp";
import { openExternal } from "../lib/openExternal";
import { getFriendCode } from "../lib/watchPartyApi";
import { SETTINGS_CARD } from "./settings/SettingsUi";

type InviteMode = "hub" | "download" | "code";

interface InviteFriendsPageProps {
  profileId: string;
  onOpenFriends?: () => void;
}

function CopyButton({
  label,
  onCopy,
  copied,
}: {
  label: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:border-white/25 hover:text-text-primary"
    >
      {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiato" : label}
    </button>
  );
}

export function InviteFriendsPage({
  profileId,
  onOpenFriends,
}: InviteFriendsPageProps) {
  const { notify } = useNotifications();
  const { profile: cloudProfile } = useCloudAccount();
  const [mode, setMode] = useState<InviteMode>("hub");
  const [lanCode, setLanCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedLan, setCopiedLan] = useState(false);
  const [copiedCloud, setCopiedCloud] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingCode(true);
    void getFriendCode(profileId)
      .then((code) => {
        if (!cancelled) setLanCode(code);
      })
      .catch(() => {
        if (!cancelled) setLanCode("");
      })
      .finally(() => {
        if (!cancelled) setLoadingCode(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const inviteMessage = useCallback(() => {
    const lines = [
      "Scarica Branchefy e guardiamo insieme film, serie e anime!",
      APP_DOWNLOAD_URL,
    ];
    if (lanCode) {
      lines.push(`Il mio codice amico LAN: ${lanCode}`);
    }
    if (cloudProfile?.friendCode) {
      lines.push(`Il mio codice amico cloud: ${cloudProfile.friendCode}`);
    }
    return lines.join("\n");
  }, [cloudProfile?.friendCode, lanCode]);

  const copyText = async (
    text: string,
    setCopied: (value: boolean) => void,
    successTitle: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      notify({ kind: "success", title: successTitle });
    } catch {
      notify({
        kind: "info",
        title: "Copia non riuscita",
        message: "Prova a selezionare e copiare il testo manualmente.",
      });
    }
  };

  const openDownloadPage = async () => {
    await openExternal(APP_DOWNLOAD_URL);
  };

  return (
    <div className="page-px pb-16 pt-24 sm:pt-28">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-muted">
            Supporto
          </p>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
            Invita amici
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-text-muted">
            Scegli come invitare qualcuno: condividi il link per scaricare
            Branchefy oppure invia il tuo codice amico.
          </p>
        </header>

        <AnimatePresence mode="wait">
          {mode === "hub" && (
            <motion.div
              key="hub"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <button
                type="button"
                onClick={() => setMode("download")}
                className={`${SETTINGS_CARD} group flex h-full flex-col items-start text-left transition-colors hover:border-white/15 hover:bg-white/[0.03]`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <Link2 className="h-5 w-5" strokeWidth={2} />
                </span>
                <h2 className="font-display mt-5 text-xl font-medium tracking-[-0.02em] text-text-primary">
                  Invito download
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
                  Genera un link alla pagina download per chi non ha ancora
                  installato Branchefy.
                </p>
                <span className="mt-5 text-[12px] font-medium text-accent">
                  Crea invito →
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode("code")}
                className={`${SETTINGS_CARD} group flex h-full flex-col items-start text-left transition-colors hover:border-white/15 hover:bg-white/[0.03]`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint/15 text-mint">
                  <UserPlus className="h-5 w-5" strokeWidth={2} />
                </span>
                <h2 className="font-display mt-5 text-xl font-medium tracking-[-0.02em] text-text-primary">
                  Codice amico
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
                  Copia il tuo codice LAN o cloud da incollare nell&apos;app di
                  chi vuoi aggiungere.
                </p>
                <span className="mt-5 text-[12px] font-medium text-mint">
                  Mostra codici →
                </span>
              </button>
            </motion.div>
          )}

          {mode === "download" && (
            <motion.div
              key="download"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => setMode("hub")}
                className="inline-flex items-center gap-2 text-[13px] text-text-muted transition-colors hover:text-text-secondary"
              >
                <ArrowLeft className="h-4 w-4" />
                Torna alla scelta
              </button>

              <section className={SETTINGS_CARD}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
                    <Share2 className="h-5 w-5 text-accent" strokeWidth={2} />
                  </span>
                  <div>
                    <h2 className="font-display text-[18px] font-medium tracking-[-0.02em] text-text-primary">
                      Link invito
                    </h2>
                    <p className="mt-1 text-[13px] text-text-muted">
                      Condividi questo link con chi deve installare l&apos;app.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                  <p className="break-all font-mono text-[13px] text-text-secondary">
                    {APP_DOWNLOAD_URL}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void openDownloadPage()}
                    className="inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[13px] font-medium text-void transition-opacity hover:opacity-90"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Apri pagina download
                  </button>
                  <CopyButton
                    label="Copia link"
                    copied={copiedLink}
                    onCopy={() => void copyText(APP_DOWNLOAD_URL, setCopiedLink, "Link copiato")}
                  />
                  <CopyButton
                    label="Copia invito completo"
                    copied={copiedInvite}
                    onCopy={() =>
                      void copyText(inviteMessage(), setCopiedInvite, "Invito copiato")
                    }
                  />
                </div>

                <p className="mt-4 text-[12px] leading-relaxed text-text-muted">
                  L&apos;invito completo include il link e, se disponibili, i
                  tuoi codici amico così possono aggiungerti subito dopo
                  l&apos;installazione.
                </p>
              </section>
            </motion.div>
          )}

          {mode === "code" && (
            <motion.div
              key="code"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => setMode("hub")}
                className="inline-flex items-center gap-2 text-[13px] text-text-muted transition-colors hover:text-text-secondary"
              >
                <ArrowLeft className="h-4 w-4" />
                Torna alla scelta
              </button>

              <section className={SETTINGS_CARD}>
                <div className="mb-4 flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-text-muted" />
                  <h2 className="text-[15px] font-medium text-text-primary">
                    Codice LAN
                  </h2>
                </div>
                <p className="text-[13px] leading-relaxed text-text-muted">
                  Per amici sulla stessa rete Wi‑Fi. Inseriscilo in Profilo →
                  Amici → Aggiungi.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="font-display text-2xl font-semibold tracking-[0.14em] text-text-primary">
                    {loadingCode ? (
                      <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
                    ) : (
                      lanCode || "—"
                    )}
                  </span>
                  <CopyButton
                    label="Copia codice LAN"
                    copied={copiedLan}
                    onCopy={() => {
                      if (!lanCode) return;
                      void copyText(lanCode, setCopiedLan, "Codice LAN copiato");
                    }}
                  />
                </div>
              </section>

              {cloudProfile && (
                <section className={SETTINGS_CARD}>
                  <div className="mb-4 flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-text-muted" />
                    <h2 className="text-[15px] font-medium text-text-primary">
                      Codice cloud
                    </h2>
                  </div>
                  <p className="text-[13px] leading-relaxed text-text-muted">
                    Per amici ovunque, con account Branchefy online.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="font-display text-2xl font-semibold tracking-[0.14em] text-text-primary">
                      {cloudProfile.friendCode}
                    </span>
                    <CopyButton
                      label="Copia codice cloud"
                      copied={copiedCloud}
                      onCopy={() =>
                        void copyText(
                          cloudProfile.friendCode,
                          setCopiedCloud,
                          "Codice cloud copiato",
                        )
                      }
                    />
                  </div>
                </section>
              )}

              {onOpenFriends && (
                <button
                  type="button"
                  onClick={onOpenFriends}
                  className="text-[13px] font-medium text-accent transition-colors hover:text-accent/80"
                >
                  Vai alla sezione Amici →
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
