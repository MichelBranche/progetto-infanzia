/** IP privati / loopback — raggiungibili solo in LAN. */
export function isPrivateOrLanHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h === "localhost") return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(h);
  if (m) {
    const second = Number.parseInt(m[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function lanWatchPartyErrorMessage(hostIp?: string): string {
  if (hostIp && !isPrivateOrLanHost(hostIp)) {
    return (
      "Connessione non riuscita: l'IP inserito non è una rete locale. " +
      "Per guardare con amici lontani, entrambi dovete avere un account Branchefy " +
      "e usare la modalità Online (non serve l'IP dell'host)."
    );
  }
  return (
    "Connessione non riuscita in LAN. Verifica stessa rete Wi‑Fi, IP host corretto " +
    "e che il firewall Windows consenta Branchefy sulla porta 17890. " +
    "Per reti diverse usa la modalità Online con account Branchefy."
  );
}
