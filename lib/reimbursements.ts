// lib/reimbursements.ts
import { maybePresignUrl } from "@/lib/garage";

export interface ReimbursementDTO {
  _id: string;
  memberId: string;
  term: string;
  amountCents: number;
  description: string;
  category: string;
  purchasedOn: string | null;
  receiptUrls: string[];
  status: string;
  reviewedAt: string | null;
  reviewNote: string;
  submittedAt: string | null;
  /// How long an officer has been sitting on it, in whole days.
  ageDays: number;
}

export function serializeReimbursement(
  reimbursement: any,
  now = new Date()
): ReimbursementDTO {
  const submittedAt = reimbursement?.createdAt
    ? new Date(reimbursement.createdAt)
    : null;
  return {
    _id: reimbursement?._id?.toString?.() ?? "",
    memberId: reimbursement?.memberId?.toString?.() ?? "",
    term: reimbursement?.term ?? "",
    amountCents: Number(reimbursement?.amountCents) || 0,
    description: reimbursement?.description ?? "",
    category: reimbursement?.category ?? "other",
    purchasedOn: reimbursement?.purchasedOn
      ? new Date(reimbursement.purchasedOn).toISOString()
      : null,
    receiptUrls: Array.isArray(reimbursement?.receiptUrls)
      ? reimbursement.receiptUrls
      : [],
    status: reimbursement?.status ?? "pending",
    reviewedAt: reimbursement?.reviewedAt
      ? new Date(reimbursement.reviewedAt).toISOString()
      : null,
    reviewNote: reimbursement?.reviewNote ?? "",
    submittedAt: submittedAt ? submittedAt.toISOString() : null,
    ageDays: submittedAt
      ? Math.max(0, Math.floor((now.getTime() - submittedAt.getTime()) / 86400000))
      : 0,
  };
}

/// Receipts live in a private bucket, so the stored URL on its own opens to
/// "Access Denied". Anything handed to a browser gets a signed link instead;
/// the stored value stays the plain one so it never expires in the database.
export async function withViewableReceipts<T extends { receiptUrls: string[] }>(
  dto: T
): Promise<T> {
  const receiptUrls = await Promise.all(
    dto.receiptUrls.map(async (url) => (await maybePresignUrl(url)) ?? url)
  );
  return { ...dto, receiptUrls };
}
