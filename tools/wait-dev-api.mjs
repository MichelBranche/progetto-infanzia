const HEALTH_URL = process.env.BRANCHEFY_HEALTH_URL ?? "http://127.0.0.1:8787/health";
const POLL_MS = 400;
const MAX_WAIT_MS = Number(process.env.BRANCHEFY_API_WAIT_MS ?? 180_000);

async function isHealthy() {
  try {
    const response = await fetch(HEALTH_URL, {
      method: "GET",
      signal: AbortSignal.timeout(2_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const started = Date.now();

while (Date.now() - started < MAX_WAIT_MS) {
  if (await isHealthy()) {
    console.log("[dev] API Rust pronta su :8787");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

console.error(
  `[dev] API Rust non raggiungibile su ${HEALTH_URL} dopo ${Math.round(MAX_WAIT_MS / 1000)}s.`,
);
console.error("[dev] Verifica che npm run dev:api sia in esecuzione (cargo branchefy-web-api).");
process.exit(1);
