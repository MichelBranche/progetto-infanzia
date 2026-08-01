import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, HeartHandshake, Loader2, XCircle } from "lucide-react";
import {
  fetchDevDonorClaims,
  reviewDevDonorClaim,
} from "../../lib/donorClaimApi";
import {
  setDevCloudUserDonor,
  fetchDevCloudUsers,
} from "../../lib/devAdminApi";
import type { DevCloudUser } from "../../types/devAdmin";
import type { DonorClaim } from "../../types/donorClaim";
import {
  DevActionBar,
  DevActionButton,
  DevBadge,
  DevChip,
  DevDetailHeader,
  DevDetailPane,
  DevErrorBanner,
  DevFilterRow,
  DevListItem,
  DevLoadingState,
  DevMasterDetail,
  DevMetaGrid,
  DevSearchInput,
  DevSidebar,
  DevUserAvatar,
  ProfileEmptyState,
  ProfileSectionLabel,
} from "./DevConsoleUi";

type DonorBucket = "pending" | "donors" | "rejected";

function formatWhen(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DevDonorsPanel() {
  const [bucket, setBucket] = useState<DonorBucket>("pending");
  const [query, setQuery] = useState("");
  const [claims, setClaims] = useState<DonorClaim[]>([]);
  const [cloudUsers, setCloudUsers] = useState<DevCloudUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, rejected, approved, users] = await Promise.all([
        fetchDevDonorClaims("pending"),
        fetchDevDonorClaims("rejected"),
        fetchDevDonorClaims("approved"),
        fetchDevCloudUsers(),
      ]);
      setClaims([...pending, ...rejected, ...approved]);
      setCloudUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingClaims = useMemo(
    () => claims.filter((c) => c.status === "pending"),
    [claims],
  );
  const rejectedClaims = useMemo(
    () => claims.filter((c) => c.status === "rejected"),
    [claims],
  );
  const donorUsers = useMemo(
    () => cloudUsers.filter((u) => u.isDonor),
    [cloudUsers],
  );

  const filteredClaims = useMemo(() => {
    const source = bucket === "pending" ? pendingClaims : rejectedClaims;
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (c) =>
        c.email?.toLowerCase().includes(q) ||
        c.displayName?.toLowerCase().includes(q) ||
        c.friendCode?.toLowerCase().includes(q) ||
        c.paypalName?.toLowerCase().includes(q) ||
        c.note?.toLowerCase().includes(q),
    );
  }, [bucket, pendingClaims, rejectedClaims, query]);

  const filteredDonors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return donorUsers;
    return donorUsers.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.displayName?.toLowerCase().includes(q) ||
        u.friendCode?.toLowerCase().includes(q),
    );
  }, [donorUsers, query]);

  const selectedClaim = useMemo(
    () => claims.find((c) => c.id === selectedClaimId) ?? null,
    [claims, selectedClaimId],
  );
  const selectedDonor = useMemo(
    () => cloudUsers.find((u) => u.userId === selectedDonorId) ?? null,
    [cloudUsers, selectedDonorId],
  );

  const review = async (claim: DonorClaim, approve: boolean) => {
    setBusyId(claim.id);
    setError(null);
    try {
      await reviewDevDonorClaim({
        claimId: claim.id,
        approve,
        adminNote: adminNote.trim() || undefined,
      });
      setAdminNote("");
      setSelectedClaimId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const revokeDonor = async (user: DevCloudUser) => {
    setBusyId(user.userId);
    setError(null);
    try {
      await setDevCloudUserDonor(user.userId, false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && claims.length === 0 && cloudUsers.length === 0) {
    return <DevLoadingState />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error ? <DevErrorBanner message={error} /> : null}

      <DevFilterRow
        trailing={
          <DevSearchInput
            value={query}
            onChange={setQuery}
            placeholder={
              bucket === "donors" ? "Cerca donatore…" : "Cerca segnalazione…"
            }
          />
        }
      >
        {(
          [
            ["pending", `Da verificare (${pendingClaims.length})`],
            ["donors", `Donatori (${donorUsers.length})`],
            ["rejected", `Rifiutate (${rejectedClaims.length})`],
          ] as const
        ).map(([id, label]) => (
          <DevChip
            key={id}
            active={bucket === id}
            onClick={() => {
              setBucket(id);
              setSelectedClaimId(null);
              setSelectedDonorId(null);
            }}
          >
            {label}
          </DevChip>
        ))}
      </DevFilterRow>

      {bucket === "donors" ? (
        <DevMasterDetail
          sidebar={
            <DevSidebar title={`Donatori (${filteredDonors.length})`}>
              {filteredDonors.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-muted">
                  Nessun donatore con stemma attivo.
                </p>
              ) : (
                filteredDonors.map((user) => (
                  <DevListItem
                    key={user.userId}
                    selected={user.userId === selectedDonorId}
                    onClick={() => setSelectedDonorId(user.userId)}
                    title={user.displayName ?? user.email}
                    subtitle={user.email}
                    meta={`Dal ${formatWhen(user.donorSince)}`}
                    leading={
                      <DevUserAvatar
                        name={user.displayName ?? user.email}
                        imageUrl={user.avatarUrl}
                      />
                    }
                  />
                ))
              )}
            </DevSidebar>
          }
          detail={
            <DevDetailPane
              empty={
                <ProfileEmptyState
                  icon={HeartHandshake}
                  title="Seleziona un donatore"
                  description="Account con stemma Donatore già assegnato."
                />
              }
            >
              {selectedDonor ? (
                <div className="space-y-5">
                  <DevDetailHeader
                    title={selectedDonor.displayName ?? selectedDonor.email}
                    subtitle={selectedDonor.email}
                    avatar={
                      <DevUserAvatar
                        name={selectedDonor.displayName ?? selectedDonor.email}
                        imageUrl={selectedDonor.avatarUrl}
                      />
                    }
                    badges={<DevBadge tone="accent">Donatore</DevBadge>}
                  />
                  <DevMetaGrid
                    items={[
                      {
                        label: "Codice amico",
                        value: (
                          <span className="font-mono">
                            {selectedDonor.friendCode ?? "—"}
                          </span>
                        ),
                      },
                      {
                        label: "Donatore da",
                        value: formatWhen(selectedDonor.donorSince),
                      },
                    ]}
                  />
                  <DevActionBar>
                    <DevActionButton
                      tone="neutral"
                      disabled={busyId === selectedDonor.userId}
                      onClick={() => void revokeDonor(selectedDonor)}
                      icon={
                        busyId === selectedDonor.userId ? Loader2 : XCircle
                      }
                    >
                      Rimuovi stemma
                    </DevActionButton>
                  </DevActionBar>
                </div>
              ) : null}
            </DevDetailPane>
          }
        />
      ) : (
        <DevMasterDetail
          sidebar={
            <DevSidebar
              title={`${
                bucket === "pending" ? "Da verificare" : "Rifiutate"
              } (${filteredClaims.length})`}
            >
              {filteredClaims.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-muted">
                  {bucket === "pending"
                    ? "Nessuna segnalazione in coda."
                    : "Nessuna segnalazione rifiutata."}
                </p>
              ) : (
                filteredClaims.map((claim) => (
                  <DevListItem
                    key={claim.id}
                    selected={claim.id === selectedClaimId}
                    onClick={() => setSelectedClaimId(claim.id)}
                    title={claim.displayName ?? claim.email ?? "Utente"}
                    subtitle={claim.email}
                    meta={`${claim.paypalName ? `${claim.paypalName} · ` : ""}${
                      claim.amountEur != null ? `${claim.amountEur}€ · ` : ""
                    }${formatWhen(claim.createdAt)}`}
                    leading={
                      <DevUserAvatar
                        name={claim.displayName ?? claim.email ?? "?"}
                        imageUrl={claim.avatarUrl}
                      />
                    }
                  />
                ))
              )}
            </DevSidebar>
          }
          detail={
            <DevDetailPane
              empty={
                <ProfileEmptyState
                  icon={HeartHandshake}
                  title="Seleziona una segnalazione"
                  description="Confronta con PayPal e approva o rifiuta."
                />
              }
            >
              {selectedClaim ? (
                <ClaimDetail
                  claim={selectedClaim}
                  busy={busyId === selectedClaim.id}
                  adminNote={adminNote}
                  onAdminNoteChange={setAdminNote}
                  onApprove={() => void review(selectedClaim, true)}
                  onReject={() => void review(selectedClaim, false)}
                />
              ) : null}
            </DevDetailPane>
          }
        />
      )}
    </div>
  );
}

function ClaimDetail({
  claim,
  busy,
  adminNote,
  onAdminNoteChange,
  onApprove,
  onReject,
}: {
  claim: DonorClaim;
  busy: boolean;
  adminNote: string;
  onAdminNoteChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusTone =
    claim.status === "approved"
      ? "mint"
      : claim.status === "rejected"
        ? "warm"
        : "accent";

  return (
    <div className="space-y-5">
      <DevDetailHeader
        title={claim.displayName ?? claim.email ?? "Utente"}
        subtitle={claim.email}
        avatar={
          <DevUserAvatar
            name={claim.displayName ?? claim.email ?? "?"}
            imageUrl={claim.avatarUrl}
          />
        }
        badges={
          <DevBadge tone={statusTone}>
            {claim.status === "pending"
              ? "In attesa"
              : claim.status === "approved"
                ? "Approvata"
                : "Rifiutata"}
          </DevBadge>
        }
      />

      <DevMetaGrid
        items={[
          {
            label: "Codice amico",
            value: (
              <span className="font-mono">{claim.friendCode ?? "—"}</span>
            ),
          },
          { label: "Nome PayPal", value: claim.paypalName ?? "—" },
          {
            label: "Importo",
            value:
              claim.amountEur != null ? `${claim.amountEur} €` : "Non indicato",
          },
          { label: "Inviata", value: formatWhen(claim.createdAt) },
          ...(claim.reviewedAt
            ? [{ label: "Revisionata", value: formatWhen(claim.reviewedAt) }]
            : []),
        ]}
      />

      {claim.note ? (
        <section className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <ProfileSectionLabel>Nota utente</ProfileSectionLabel>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
            {claim.note}
          </p>
        </section>
      ) : null}

      {claim.status === "pending" ? (
        <section className="space-y-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.04] p-4">
          <ProfileSectionLabel>Verifica PayPal</ProfileSectionLabel>
          <p className="text-[12px] leading-relaxed text-text-muted">
            Controlla su PayPal che ci sia un pagamento coerente con nome,
            importo e nota (codice amico / email). Poi approva per assegnare lo
            stemma.
          </p>
          <label className="block space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Nota admin (opzionale)
            </span>
            <input
              value={adminNote}
              onChange={(e) => onAdminNoteChange(e.target.value)}
              placeholder="es. OK PayPal 5€"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/40"
            />
          </label>
          <DevActionBar>
            <DevActionButton
              tone="mint"
              disabled={busy}
              onClick={onApprove}
              icon={busy ? Loader2 : CheckCircle2}
            >
              Approva + stemma
            </DevActionButton>
            <DevActionButton
              tone="warm"
              disabled={busy}
              onClick={onReject}
              icon={busy ? Loader2 : XCircle}
            >
              Rifiuta
            </DevActionButton>
          </DevActionBar>
        </section>
      ) : claim.adminNote ? (
        <section className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <ProfileSectionLabel>Nota admin</ProfileSectionLabel>
          <p className="text-[13px] text-text-secondary">{claim.adminNote}</p>
        </section>
      ) : null}
    </div>
  );
}
