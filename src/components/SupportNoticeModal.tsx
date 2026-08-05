import { useEffect, useState } from "react";
import { HeartHandshake, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppBroadcast } from "../hooks/useAppBroadcast";
import { useCloudAccount } from "../context/CloudAccountContext";
import { openExternal } from "../lib/openExternal";
import {
  dismissSupportNotice,
  isSupportNoticeDismissed,
  OPEN_SUPPORT_NOTICE_EVENT,
  supportDonateUrl,
} from "../lib/supportNotice";
import { DonorClaimForm } from "./DonorClaimForm";

const BODY = `Branchefy è cresciuta tanto negli ultimi tempi: più utenti significa anche costi più alti per tenere su server, cataloghi e streaming.

Oggi il mantenimento si aggira sui 50€ al mese. L’app resta gratuita, ma se ti è utile e vuoi davvero continuare a usarla, anche una donazione piccola aiuta a coprire le spese e a farla restare online.

Dopo PayPal, segnala la donazione qui (serve l’account cloud). In nota PayPal metti codice amico o email: così possiamo assegnarti lo stemma Donatore.`;

export function SupportNoticeModal() {
  const { visible: broadcastVisible } = useAppBroadcast();
  const { profile, enabled: cloudEnabled } = useCloudAccount();
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const donateUrl = supportDonateUrl();

  useEffect(() => {
    const onOpen = () => {
      setForced(true);
      setShowClaim(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_SUPPORT_NOTICE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SUPPORT_NOTICE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (broadcastVisible && !forced) return;
    if (isSupportNoticeDismissed()) {
      if (!forced) setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [broadcastVisible, forced]);

  const close = () => {
    dismissSupportNotice();
    setForced(false);
    setOpen(false);
    setShowClaim(false);
  };

  const onDonate = () => {
    if (!donateUrl) return;
    void openExternal(donateUrl);
    setShowClaim(true);
  };

  return (
    <AnimatePresence>
      {open && (!broadcastVisible || forced) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-md sm:items-center sm:p-6"
          onClick={close}
        >
          <motion.div
            role="alertdialog"
            aria-labelledby="support-notice-title"
            aria-describedby="support-notice-body"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl border border-accent/25 bg-[#0a0c12] shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-accent/15 via-accent/5 to-transparent" />

            <div className="relative px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/15 bg-accent/10 text-accent">
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
                    Amministrazione Branchefy
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Un messaggio dalla community
                  </p>
                  <h2
                    id="support-notice-title"
                    className="font-display mt-1.5 text-[clamp(1.35rem,3vw,1.75rem)] font-semibold leading-tight tracking-[-0.03em] text-text-primary"
                  >
                    Aiutaci a tenere Branchefy online
                  </h2>
                  <p
                    id="support-notice-body"
                    className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary"
                  >
                    {BODY}
                  </p>
                  {profile?.friendCode ? (
                    <p className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[12px] tracking-[0.18em] text-text-primary">
                      Codice amico: {profile.friendCode}
                    </p>
                  ) : null}

                  {showClaim ? (
                    !cloudEnabled || !profile ? (
                      <p className="mt-4 text-[13px] leading-relaxed text-amber-200/90">
                        Accedi con l’account cloud (Impostazioni) per segnalare
                        la donazione e ricevere lo stemma.
                      </p>
                    ) : profile.isDonor ? (
                      <p className="mt-4 text-[13px] leading-relaxed text-mint">
                        Hai già lo stemma Donatore. Grazie!
                      </p>
                    ) : (
                      <DonorClaimForm onDone={close} />
                    )
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Chiudi messaggio"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-text-muted transition-colors hover:border-white/20 hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative flex flex-col gap-2 border-t border-white/[0.06] bg-black/30 px-6 py-4 sm:px-7">
              <div className="flex flex-col gap-2 sm:flex-row">
                {donateUrl ? (
                  <button
                    type="button"
                    onClick={onDonate}
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-accent px-5 py-3 text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
                  >
                    Dona ora
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowClaim(true)}
                  className="inline-flex flex-1 items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-[13px] font-semibold text-amber-100 transition-colors hover:bg-amber-400/15"
                >
                  Ho già donato
                </button>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex w-full items-center justify-center rounded-full border border-white/10 px-5 py-3 text-[13px] font-semibold text-text-primary transition-colors hover:border-white/20 hover:bg-white/[0.04]"
              >
                Continua
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
