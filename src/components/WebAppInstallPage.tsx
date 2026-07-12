import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Play, Smartphone } from "lucide-react";
import { APP_WEB_URL } from "../lib/platformPromo";
import { openExternal } from "../lib/openExternal";
import {
  WEB_APP_PLATFORM_GUIDES,
  webAppInstallVideoEmbedUrl,
  type WebAppInstallStep,
} from "../lib/webAppRoutes";
import { MobilePromoMockups } from "./MobilePromoMockups";

function GuideSteps({ steps }: { steps: WebAppInstallStep[] }) {
  return (
    <ol className="lf-webapp-install__steps">
      {steps.map((step, index) => (
        <li key={step.title} className="lf-webapp-install__step">
          <span className="lf-webapp-install__step-num">{index + 1}</span>
          <div>
            <p className="lf-webapp-install__step-title">{step.title}</p>
            <p className="lf-webapp-install__step-detail">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function WebAppInstallPage() {
  const openWebApp = () => {
    void openExternal(APP_WEB_URL);
  };

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "/";
  };

  return (
    <div className="lf-webapp-install">
      <div className="lf-webapp-install__bg" aria-hidden />
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.04]" />

      <header className="lf-webapp-install__header page-px">
        <button
          type="button"
          onClick={goBack}
          className="lf-webapp-install__back"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          Indietro
        </button>
      </header>

      <main className="lf-webapp-install__main page-px">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="lf-webapp-install__hero lf-platform-promo__card lf-platform-promo__card--mobile-web"
        >
          <div className="lf-platform-promo__sheen" aria-hidden />
          <div className="lf-platform-promo__tint" aria-hidden />
          <div className="lf-platform-promo__rim" aria-hidden />

          <div className="lf-webapp-install__hero-grid">
            <div>
              <span className="lf-platform-promo__badge lf-platform-promo__badge--mobile-web">
                Web app mobile
              </span>
              <h1 className="lf-webapp-install__title">
                Branchefy su iPhone, iPad e Android
              </h1>
              <p className="lf-webapp-install__lead">
                Nessun App Store: aggiungi Branchefy alla schermata Home dal
                browser e ottieni un&apos;icona che si apre a schermo intero,
                come un&apos;app installata.
              </p>
              <div className="lf-webapp-install__hero-actions">
                <button
                  type="button"
                  onClick={openWebApp}
                  className="lf-platform-promo__cta lf-platform-promo__cta--mobile-web"
                >
                  Apri {APP_WEB_URL.replace(/^https?:\/\//, "")}
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>
            </div>
            <MobilePromoMockups size="page" />
          </div>
        </motion.section>

        <section className="lf-webapp-install__section" id="video-guida">
          <div className="lf-webapp-install__section-head">
            <span className="lf-platform-promo__badge lf-platform-promo__badge--mobile-web">
              <Play className="h-3 w-3" strokeWidth={2.5} />
              Video guida
            </span>
            <h2 className="lf-webapp-install__section-title">
              Guarda come aggiungere Branchefy alla Home
            </h2>
            <p className="lf-webapp-install__section-lead">
              Tutorial rapido in formato Shorts: i passaggi principali per
              installare la web app sul telefono.
            </p>
          </div>

          <div className="lf-webapp-install__video-wrap">
            <iframe
              className="lf-webapp-install__video"
              src={webAppInstallVideoEmbedUrl()}
              title="Guida installazione web app Branchefy su mobile"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </section>

        <section className="lf-webapp-install__section">
          <div className="lf-webapp-install__section-head">
            <span className="lf-platform-promo__badge lf-platform-promo__badge--mobile-web">
              Prima di iniziare
            </span>
            <h2 className="lf-webapp-install__section-title">
              Quattro passi veloci
            </h2>
          </div>

          <div className="lf-webapp-install__primer lf-platform-promo__card lf-platform-promo__card--mobile-web">
            <div className="lf-platform-promo__sheen" aria-hidden />
            <div className="lf-platform-promo__tint" aria-hidden />
            <ol className="lf-webapp-install__primer-list">
              <li>
                Apri{" "}
                <button
                  type="button"
                  onClick={openWebApp}
                  className="lf-webapp-install__inline-link"
                >
                  {APP_WEB_URL}
                </button>{" "}
                sul telefono o tablet.
              </li>
              <li>Accedi o crea il tuo account, poi un profilo.</li>
              <li>Scegli la guida per il tuo dispositivo qui sotto.</li>
              <li>Usa l&apos;icona sulla Home per aprire Branchefy in futuro.</li>
            </ol>
          </div>
        </section>

        <section className="lf-webapp-install__section" id="guide">
          <div className="lf-webapp-install__section-head">
            <Smartphone className="h-5 w-5 text-lavender" strokeWidth={2} />
            <h2 className="lf-webapp-install__section-title">
              Guida per dispositivo
            </h2>
          </div>

          <div className="lf-webapp-install__guides">
            {WEB_APP_PLATFORM_GUIDES.map((guide) => (
              <article
                key={guide.id}
                className="lf-webapp-install__guide lf-platform-promo__card lf-platform-promo__card--mobile-web"
              >
                <div className="lf-platform-promo__sheen" aria-hidden />
                <div className="lf-platform-promo__tint" aria-hidden />
                <div className="lf-webapp-install__guide-head">
                  <span className="lf-platform-promo__badge lf-platform-promo__badge--mobile-web">
                    {guide.badge}
                  </span>
                  <span className="lf-webapp-install__browser">{guide.browser}</span>
                </div>
                <h3 className="lf-webapp-install__guide-title">{guide.platform}</h3>
                <p className="lf-webapp-install__guide-intro">{guide.intro}</p>
                <GuideSteps steps={guide.steps} />
                {guide.warnings?.length ? (
                  <aside className="lf-webapp-install__warn" role="note">
                    <p className="lf-webapp-install__warn-label">Attenzione</p>
                    <ul>
                      {guide.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </aside>
                ) : null}
                <div className="lf-webapp-install__tips">
                  <p className="lf-webapp-install__tips-label">Suggerimenti</p>
                  <ul>
                    {guide.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="lf-webapp-install__beta" role="note">
          <p className="lf-webapp-install__warn-label">Versione beta</p>
          <p>
            La web app mobile è ancora in sviluppo: potresti notare bug o
            funzioni incomplete. L&apos;app desktop resta l&apos;opzione più
            stabile per guardare senza problemi.
          </p>
        </aside>
      </main>
    </div>
  );
}
