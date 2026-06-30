import { getSupabase } from "./supabaseClient";
import type { CloudFriend, CloudFriendRequest, CloudProfile } from "../types/cloud";

function mapProfile(row: {
  id: string;
  email: string;
  display_name: string;
  friend_code: string;
  created_at: string;
}): CloudProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    friendCode: row.friend_code,
    createdAt: row.created_at,
  };
}

export async function sendFriendRequestByEmail(
  email: string,
): Promise<CloudFriendRequest> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) throw new Error("Accedi al tuo account cloud");

  const { data: found, error: lookupError } = await supabase.rpc(
    "lookup_friend_by_email",
    { lookup_email: email.trim() },
  );

  if (lookupError) throw new Error(lookupError.message);
  const target = (found as { user_id: string }[] | null)?.[0];
  if (!target?.user_id) {
    throw new Error("Nessun utente trovato con questa email");
  }

  if (target.user_id === myId) {
    throw new Error("Non puoi aggiungere te stesso");
  }

  const { data: existing } = await supabase
    .from("friend_requests")
    .select("*")
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${target.user_id}),and(requester_id.eq.${target.user_id},addressee_id.eq.${myId})`,
    )
    .maybeSingle();

  if (existing?.status === "accepted") {
    throw new Error("Siete già amici");
  }
  if (existing?.status === "pending") {
    throw new Error("Richiesta già inviata o in attesa");
  }

  const { data, error } = await supabase
    .from("friend_requests")
    .insert({
      requester_id: myId,
      addressee_id: target.user_id,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    requesterId: data.requester_id,
    addresseeId: data.addressee_id,
    status: data.status,
    createdAt: data.created_at,
  };
}

export async function listCloudFriends(): Promise<CloudFriend[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) return [];

  const { data: rows, error } = await supabase
    .from("friend_requests")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);

  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  const otherIds = rows.map((row) =>
    row.requester_id === myId ? row.addressee_id : row.requester_id,
  );

  const { data: profiles, error: profileError } = await supabase
    .from("cloud_profiles")
    .select("id, email, display_name, friend_code")
    .in("id", otherIds);

  if (profileError) throw new Error(profileError.message);

  return (profiles ?? []).map((p) => ({
    userId: p.id,
    displayName: p.display_name,
    friendCode: p.friend_code,
    email: p.email,
  }));
}

/** Accepted requests where the current user was the requester (for acceptance toasts). */
export async function listAcceptedAsRequester(): Promise<CloudFriendRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) return [];

  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "*, addressee:cloud_profiles!friend_requests_addressee_id_fkey(id, email, display_name, friend_code, created_at)",
    )
    .eq("requester_id", myId)
    .eq("status", "accepted");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at,
    addressee: row.addressee
      ? mapProfile(
          row.addressee as {
            id: string;
            email: string;
            display_name: string;
            friend_code: string;
            created_at: string;
          },
        )
      : undefined,
  }));
}

export async function listPendingFriendRequests(): Promise<CloudFriendRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) return [];

  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "*, requester:cloud_profiles!friend_requests_requester_id_fkey(id, email, display_name, friend_code, created_at)",
    )
    .eq("addressee_id", myId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at,
    requester: row.requester
      ? mapProfile(
          row.requester as {
            id: string;
            email: string;
            display_name: string;
            friend_code: string;
            created_at: string;
          },
        )
      : undefined,
  }));
}

export async function respondFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { error } = await supabase
    .from("friend_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", requestId);

  if (error) throw new Error(error.message);
}

export async function removeCloudFriend(friendUserId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const myId = sessionData.session?.user?.id;
  if (!myId) throw new Error("Non autenticato");

  const { error } = await supabase
    .from("friend_requests")
    .delete()
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${friendUserId}),and(requester_id.eq.${friendUserId},addressee_id.eq.${myId})`,
    );

  if (error) throw new Error(error.message);
}
