import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./index.css";
import { initWebAudioUnlock } from "./lib/webAudio";
import { syncShellLayoutClasses } from "./lib/mobileDevice";

if (isTauri()) {
  document.documentElement.classList.add("is-tauri");
}

syncShellLayoutClasses();
initWebAudioUnlock();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>,
);
