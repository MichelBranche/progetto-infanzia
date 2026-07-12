import { APP_WEB_URL } from "./platformPromo";

export const WEB_APP_INSTALL_PATH = "/web-app";

export const WEB_APP_INSTALL_VIDEO_ID = "g7DObKPTJxA";

export function isWebAppInstallPath(pathname: string): boolean {
  return /^\/web-app\/?$/.test(pathname);
}

export function webAppInstallPageUrl(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return `${window.location.origin}${WEB_APP_INSTALL_PATH}`;
  }
  return `${APP_WEB_URL.replace(/\/$/, "")}${WEB_APP_INSTALL_PATH}`;
}

export function webAppInstallVideoWatchUrl(): string {
  return `https://www.youtube.com/watch?v=${WEB_APP_INSTALL_VIDEO_ID}`;
}

export function webAppInstallVideoThumbnailUrl(): string {
  return `https://i.ytimg.com/vi/${WEB_APP_INSTALL_VIDEO_ID}/hqdefault.jpg`;
}

export interface WebAppInstallStep {
  title: string;
  detail: string;
}

export interface WebAppPlatformGuide {
  id: string;
  platform: string;
  browser: string;
  badge: string;
  intro: string;
  steps: WebAppInstallStep[];
  tips: string[];
  warnings?: string[];
}

export const WEB_APP_PLATFORM_GUIDES: WebAppPlatformGuide[] = [
  {
    id: "ios",
    platform: "iPhone e iPad",
    browser: "Safari",
    badge: "iOS / iPadOS",
    intro:
      "Su iPhone e iPad la web app si aggiunge alla Home da Safari. Chrome e altri browser su iOS non supportano l'installazione come app.",
    steps: [
      {
        title: "Apri Safari",
        detail:
          "Usa Safari (icona blu). Se il link si è aperto in un'altra app, copia l'indirizzo e incollalo in Safari.",
      },
      {
        title: "Vai alla web app",
        detail:
          "Apri branchefy.it, accedi al tuo account e attendi il caricamento completo.",
      },
      {
        title: "Tocca Condividi",
        detail:
          "In basso su iPhone (in alto su iPad) tocca Condividi: quadrato con freccia verso l'alto.",
      },
      {
        title: "Aggiungi a Home",
        detail:
          "Scorri il menu e scegli «Aggiungi a Home» (icona con il simbolo +).",
      },
      {
        title: "Conferma il nome",
        detail:
          "Lascia «Branchefy» o personalizza il nome, poi tocca «Aggiungi».",
      },
      {
        title: "Apri dalla Home",
        detail:
          "Troverai l'icona sulla schermata Home. Aprila: si aprirà a schermo intero.",
      },
    ],
    tips: [
      "Su iPad puoi usare Branchefy in landscape con la stessa icona sulla Home.",
      "Trascina l'icona nella dock per averla sempre a portata di mano.",
      "Per rimuoverla: tieni premuto l'icona → «Rimuovi app».",
    ],
    warnings: ["Su iOS funziona solo con Safari, non con Chrome né Firefox."],
  },
  {
    id: "android",
    platform: "Android",
    browser: "Chrome",
    badge: "Android",
    intro:
      "Su Android il metodo consigliato è Chrome. Alcuni telefoni mostrano «Installa app», altri «Aggiungi a schermata Home».",
    steps: [
      {
        title: "Apri Chrome",
        detail:
          "Usa Google Chrome. Su Samsung Internet o Firefox i passaggi sono simili ma i menu cambiano leggermente.",
      },
      {
        title: "Vai alla web app",
        detail: "Apri branchefy.it e attendi che la pagina sia caricata.",
      },
      {
        title: "Apri il menu",
        detail: "Tocca i tre puntini in alto a destra (⋮).",
      },
      {
        title: "Installa o aggiungi",
        detail:
          "Scegli «Installa app» o «Aggiungi a schermata Home». Se compare un banner in basso, puoi usare anche quello.",
      },
      {
        title: "Conferma l'installazione",
        detail: "Nella finestra di conferma tocca «Installa» o «Aggiungi».",
      },
      {
        title: "Trova l'icona",
        detail:
          "L'icona Branchefy apparirà nella Home o nel cassetto app, a schermo intero.",
      },
    ],
    tips: [
      "Su Samsung: menu (≡) → «Aggiungi pagina a» → «Schermata Home».",
      "Per disinstallare: tieni premuta l'icona → «Disinstalla».",
    ],
    warnings: [
      "La voce di menu può chiamarsi «Installa app», «Aggiungi a Home» o «Installa» a seconda del dispositivo.",
    ],
  },
];
