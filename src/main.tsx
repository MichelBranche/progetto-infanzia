import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";
import { initWebAudioUnlock } from "./lib/webAudio";
import { syncShellLayoutClasses } from "./lib/mobileDevice";
import { applyChromeMode } from "./lib/chromeTheme";

if (isTauri()) {
  document.documentElement.classList.add("is-tauri");
}

applyChromeMode();
syncShellLayoutClasses();
initWebAudioUnlock();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
      {!isTauri() && <Analytics />}
    </AppErrorBoundary>
  </React.StrictMode>,
);
