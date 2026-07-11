import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  UserPlus,
  Users,
  Wifi,
} from "lucide-react";
import { useCloudAccount } from "../context/CloudAccountContext";
import { useNotifications } from "../context/NotificationContext";
import { APP_DOWNLOAD_URL } from "../lib/shareApp";
import { openExternal } from "../lib/openExternal";
import { getFriendCode } from "../lib/watchPartyApi";
import {
  SettingsButton,
  SettingsCard,
  SettingsGroupLabel,
  SettingsIconBadge,
  SettingsInset,
  SettingsSection,
} from "./settings/SettingsUi";

type InviteMode = "hub" | "download" | "code";

interface InviteFriendsPageProps {
  profileId: string;
  onOpenFriends?: () => void;
}

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function CopyButton({
  label,
  onCopy,
  copied,
  disabled,
}: {
  label: string;
  onCopy: () => void;
  copied: boolean;
  disabled?: boolean;
}) {
  return (
    <SettingsButton
      variant={copied ? "accent" : "secondary"}
      onClick={onCopy}
      disabled={disabled}
      className="px-4 py-2"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiato" : label}
    </SettingsButton>
  );
}

function HubOptionCard({
  icon: Icon,
  iconClassName,
  title,
  description,
  cta,
  ctaClassName,
  onClick,
  delay,
}: {
  icon: typeof Link2;
  iconClassName: string;
  title: string;
  description: string;
  cta: string;
  ctaClassName: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group text-left"
    >
      <SettingsCard className="h-full transition-all duration-300 hover:border-white/14 hover:shadow-[0_20px_56px_rgba(0,0,0,0.42)]">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.06] ${iconClassName}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <h2 className="font-display mt-5 text-[1.15rem] font-semibold tracking-[-0.03em] text-text-primary">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{description}</p>
        <span
          className={`mt-5 inline-flex items-center gap-1 text-[12px] font-semibold transition-transform group-hover:translate-x-0.5 ${ctaClassName}`}
        >
          {cta}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </SettingsCard>
    </motion.button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <SettingsButton variant="secondary" onClick={onClick} className="mb-1 px-3 py-2">
      <ArrowLeft className="h-3.5 w-3.5" />
      Torna alla scelta
    </SettingsButton>
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
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-15%,rgba(94,234,212,0.09),transparent_65%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-void/80 to-transparent" />
        <div className="noise-overlay absolute inset-0 opacity-[0.035]" />
      </div>

      <div className="page-px relative pb-24 pt-[calc(var(--app-nav-height)+1.75rem)] sm:pt-[calc(var(--app-nav-height)+2.25rem)]">
        <div className="mx-auto w-full max-w-2xl">
          <motion.header
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 text-center sm:mb-10"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
              <span className="chromatic-logo chromatic-logo--skew font-display text-[2rem] font-black leading-none tracking-[-0.08em]">
                B
              </span>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-accent">
              Branchefy
            </p>
            <h1 className="font-display mt-2 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-[-0.04em] text-text-primary">
              Invita amici
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-text-muted">
              Condividi il link di download o i tuoi codici amico per guardare insieme
              film, serie e anime.
            </p>
          </motion.header>

          <AnimatePresence mode="wait">
            {mode === "hub" && (
              <motion.div
                key="hub"
                {...pageMotion}
                transition={{ duration: 0.35 }}
                className="space-y-3"
              >
                <SettingsGroupLabel>Scegli un metodo</SettingsGroupLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <HubOptionCard
                    icon={Link2}
                    iconClassName="bg-accent/12 text-accent"
                    title="Invito download"
                    description="Link alla pagina download per chi non ha ancora installato Branchefy."
                    cta="Crea invito"
                    ctaClassName="text-accent"
                    onClick={() => setMode("download")}
                    delay={0.05}
                  />
                  <HubOptionCard
                    icon={UserPlus}
                    iconClassName="bg-mint/12 text-mint"
                    title="Codice amico"
                    description="Codice LAN o cloud da incollare in Profilo → Amici → Aggiungi."
                    cta="Mostra codici"
                    ctaClassName="text-mint"
                    onClick={() => setMode("code")}
                    delay={0.1}
                  />
                </div>
              </motion.div>
            )}

            {mode === "download" && (
              <motion.div
                key="download"
                {...pageMotion}
                transition={{ duration: 0.35 }}
                className="space-y-4"
              >
                <BackButton onClick={() => setMode("hub")} />

                <SettingsSection
                  icon={Share2}
                  title="Link invito"
                  description="Condividi questo link con chi deve installare l'app"
                >
                  <SettingsInset>
                    <p className="break-all font-mono text-[13px] leading-relaxed text-text-secondary">
                      {APP_DOWNLOAD_URL}
                    </p>
                  </SettingsInset>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <SettingsButton variant="primary" onClick={() => void openDownloadPage()}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      Apri pagina download
                    </SettingsButton>
                    <CopyButton
                      label="Copia link"
                      copied={copiedLink}
                      onCopy={() =>
                        void copyText(APP_DOWNLOAD_URL, setCopiedLink, "Link copiato")
                      }
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
                    L&apos;invito completo include il link e, se disponibili, i tuoi codici
                    amico così possono aggiungerti subito dopo l&apos;installazione.
                  </p>
                </SettingsSection>
              </motion.div>
            )}

            {mode === "code" && (
              <motion.div
                key="code"
                {...pageMotion}
                transition={{ duration: 0.35 }}
                className="space-y-3"
              >
                <BackButton onClick={() => setMode("hub")} />

                <SettingsGroupLabel>Rete locale</SettingsGroupLabel>
                <SettingsSection
                  icon={Wifi}
                  title="Codice LAN"
                  description="Per amici sulla stessa rete Wi‑Fi. Inseriscilo in Profilo → Amici → Aggiungi."
                >
                  <SettingsInset className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-[clamp(1.5rem,5vw,2rem)] font-semibold tracking-[0.14em] text-text-primary">
                      {loadingCode ? (
                        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
                      ) : (
                        lanCode || "—"
                      )}
                    </span>
                    <CopyButton
                      label="Copia codice LAN"
                      copied={copiedLan}
                      disabled={!lanCode}
                      onCopy={() => {
                        if (!lanCode) return;
                        void copyText(lanCode, setCopiedLan, "Codice LAN copiato");
                      }}
                    />
                  </SettingsInset>
                </SettingsSection>

                {cloudProfile ? (
                  <>
                    <SettingsGroupLabel>Online</SettingsGroupLabel>
                    <SettingsSection
                      icon={Cloud}
                      title="Codice cloud"
                      description="Per amici ovunque, con account Branchefy online."
                      variant="accent"
                    >
                      <SettingsInset className="flex flex-wrap items-center gap-3 border-accent/15 bg-accent/[0.04]">
                        <span className="font-display text-[clamp(1.5rem,5vw,2rem)] font-semibold tracking-[0.14em] text-text-primary">
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
                      </SettingsInset>
                    </SettingsSection>
                  </>
                ) : (
                  <SettingsCard>
                    <div className="flex items-start gap-3">
                      <SettingsIconBadge icon={Cloud} className="opacity-80" />
                      <div>
                        <p className="font-display text-[14px] font-semibold tracking-[-0.02em] text-text-primary">
                          Codice cloud non disponibile
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                          Accedi con un account online dalle Impostazioni per invitare amici
                          anche fuori dalla tua rete.
                        </p>
                      </div>
                    </div>
                  </SettingsCard>
                )}

                {onOpenFriends && (
                  <div className="pt-1">
                    <SettingsButton variant="accent" onClick={onOpenFriends}>
                      <Users className="h-3.5 w-3.5" />
                      Vai alla sezione Amici
                      <ChevronRight className="h-3.5 w-3.5" />
                    </SettingsButton>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
