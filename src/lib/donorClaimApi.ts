import { getSupabase } from "./supabaseClient";
import { isDevAdminEmail } from "./devAdmin";
import { cloudConfigHint } from "./cloudConfig";
import type { DonorClaim, DonorClaimStatus } from "../types/donorClaim";

function mapClaim(row: Record<string, unknown>): DonorClaim {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    note: row.note ? String(row.note) : undefined,
    paypalName: row.paypal_name ? String(row.paypal_name) : undefined,
    amountEur:
      row.amount_eur != null && row.amount_eur !== ""
        ? Number(row.amount_eur)
        : undefined,
    status: String(row.status ?? "pending") as DonorClaimStatus,
    adminNote: row.admin_note ? String(row.admin_note) : undefined,
    createdAt: String(row.created_at ?? ""),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    email: row.email ? String(row.email) : undefined,
    displayName: row.display_name ? String(row.display_name) : undefined,
    friendCode: row.friend_code ? String(row.friend_code) : undefined,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    isDonor: row.is_donor != null ? Boolean(row.is_donor) : undefined,
  };
}

export async function submitDonorClaim(input: {
  note?: string;
  paypalName?: string;
  amountEur?: number;
}): Promise<{ id: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error(cloudConfigHint());

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    throw new Error("Accedi con l’account cloud prima di segnalare la donazione.");
  }

  const { data, error } = await supabase.rpc("submit_donor_claim", {
    p_note: input.note?.trim() || null,
    p_paypal_name: input.paypalName?.trim() || null,
    p_amount_eur:
      input.amountEur != null && Number.isFinite(input.amountEur)
        ? input.amountEur
        : null,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return { id: String(row.id ?? "") };
}

export async function fetchMyDonorClaims(): Promise<DonorClaim[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("donor_claims")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapClaim(row as Record<string, unknown>));
}

export async function fetchDevDonorClaims(
  status?: DonorClaimStatus | null,
): Promise<DonorClaim[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user?.email;
  if (!isDevAdminEmail(email)) {
    throw new Error("Accesso riservato allo sviluppatore");
  }

  const { data, error } = await supabase.rpc("dev_list_donor_claims", {
    p_status: status ?? null,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => mapClaim(row as Record<string, unknown>));
}

export async function reviewDevDonorClaim(input: {
  claimId: string;
  approve: boolean;
  adminNote?: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user?.email;
  if (!isDevAdminEmail(email)) {
    throw new Error("Accesso riservato allo sviluppatore");
  }

  const { error } = await supabase.rpc("dev_review_donor_claim", {
    p_claim_id: input.claimId,
    p_approve: input.approve,
    p_admin_note: input.adminNote?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
