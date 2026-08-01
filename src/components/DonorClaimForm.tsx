import { useState } from "react";
import { Loader2 } from "lucide-react";
import { submitDonorClaim } from "../lib/donorClaimApi";

export function DonorClaimForm({
  onDone,
  compact = false,
}: {
  onDone?: () => void;
  compact?: boolean;
}) {
  const [paypalName, setPaypalName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const parsed =
        amount.trim() === "" ? undefined : Number(amount.replace(",", "."));
      if (parsed != null && (!Number.isFinite(parsed) || parsed <= 0)) {
        throw new Error("Importo non valido");
      }
      await submitDonorClaim({
        paypalName: paypalName.trim() || undefined,
        amountEur: parsed,
        note: note.trim() || undefined,
      });
      setOk(true);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (ok) {
    return (
      <p className="text-[13px] leading-relaxed text-mint">
        Segnalazione inviata. Verificheremo il pagamento PayPal e ti assegneremo
        lo stemma Donatore.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "mt-4 space-y-3"}>
      <p className="text-[12px] leading-relaxed text-text-muted">
        In nota PayPal metti anche il tuo codice amico o l’email dell’account.
        Poi compila qui per farci abbinare la donazione.
      </p>
      <label className="block space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Nome su PayPal
        </span>
        <input
          value={paypalName}
          onChange={(e) => setPaypalName(e.target.value)}
          placeholder="Come compare nel pagamento"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Importo (€, opzionale)
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="es. 5"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Nota
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Codice amico, dettagli utili…"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
        />
      </label>
      {error ? (
        <p className="text-[12px] leading-relaxed text-warm">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/15 px-5 py-3 text-[13px] font-semibold text-amber-100 transition-colors hover:bg-amber-400/20 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? "Invio…" : "Ho donato — segnala"}
      </button>
    </div>
  );
}
