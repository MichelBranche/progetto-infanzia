export type DonorClaimStatus = "pending" | "approved" | "rejected";

export interface DonorClaim {
  id: string;
  userId: string;
  note?: string;
  paypalName?: string;
  amountEur?: number;
  status: DonorClaimStatus;
  adminNote?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  email?: string;
  displayName?: string;
  friendCode?: string;
  avatarUrl?: string;
  isDonor?: boolean;
}
