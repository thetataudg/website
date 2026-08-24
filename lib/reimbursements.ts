// lib/reimbursements.ts
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
