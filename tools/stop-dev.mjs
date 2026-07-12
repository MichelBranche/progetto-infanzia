import { execSync } from "node:child_process";

const PORTS = [5173, 8787];

function killPortWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("LISTENING")) continue;
      const parts = trimmed.split(/\s+/);
      const pid = Number(parts.at(-1));
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`[dev:stop] Terminato PID ${pid} (porta ${port})`);
      } catch {
        // già chiuso
      }
    }
    if (pids.size === 0) {
      console.log(`[dev:stop] Porta ${port} libera`);
    }
  } catch {
    console.log(`[dev:stop] Porta ${port} libera`);
  }
}

function killPortUnix(port) {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: "utf8" }).trim();
    if (!out) {
      console.log(`[dev:stop] Porta ${port} libera`);
      return;
    }
    for (const pid of out.split(/\s+/)) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
        console.log(`[dev:stop] Terminato PID ${pid} (porta ${port})`);
      } catch {
        // ignore
      }
    }
  } catch {
    console.log(`[dev:stop] Porta ${port} libera`);
  }
}

const killPort = process.platform === "win32" ? killPortWindows : killPortUnix;

for (const port of PORTS) {
  killPort(port);
}

console.log("[dev:stop] Pronto per npm run dev:browser");
