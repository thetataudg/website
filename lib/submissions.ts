// lib/submissions.ts
// Turning a member's "I paid" claim into a ledger entry, and the pieces both
// the website and the app need to render one.
import PaymentSubmission from "@/lib/models/PaymentSubmission";

export interface PaymentSubmissionDTO {
  _id: string;
  memberId: string;
  chargeId: string;
  planId: string | null;
  planSeq: number | null;
  amountCents: number;
  method: string;
  reference: string;
  proofUrl: string;
  paidOn: string | null;
  submittedAt: string | null;
  status: string;
  reviewedAt: string | null;
  reviewNote: string;
  /// How long an officer has been sitting on this, in whole days. Rendered
  /// server-side so the queue can be sorted and coloured without every client
  /// re-deriving it.
  ageDays: number;
}

export const SUBMISSION_METHODS = [
  "cash",
  "venmo",
  "zelle",
  "check",
  "other",
] as const;

export function serializeSubmission(
  submission: any,
  now = new Date()
): PaymentSubmissionDTO {
  const submittedAt = submission?.submittedAt
    ? new Date(submission.submittedAt)
    : null;
  const paidOn = submission?.paidOn ? new Date(submission.paidOn) : null;
  return {
    _id: submission?._id?.toString?.() ?? "",
    memberId: submission?.memberId?.toString?.() ?? "",
    chargeId: submission?.chargeId?.toString?.() ?? "",
    planId: submission?.planId?.toString?.() ?? null,
    planSeq: submission?.planSeq ?? null,
    amountCents: Number(submission?.amountCents) || 0,
    method: submission?.method ?? "other",
    reference: submission?.reference ?? "",
    proofUrl: submission?.proofUrl ?? "",
    paidOn: paidOn ? paidOn.toISOString() : null,
    submittedAt: submittedAt ? submittedAt.toISOString() : null,
    status: submission?.status ?? "pending",
    reviewedAt: submission?.reviewedAt
      ? new Date(submission.reviewedAt).toISOString()
      : null,
    reviewNote: submission?.reviewNote ?? "",
    ageDays: submittedAt
      ? Math.max(
          0,
          Math.floor((now.getTime() - submittedAt.getTime()) / 86400000)
        )
      : 0,
  };
}

/// Which of these members are waiting on the chapter right now.
///
/// A member with a claim in the queue has done their part, so nothing should
/// mark them overdue or send them a reminder while an officer gets to it. This
/// is one query for a whole page rather than one per member.
export async function membersAwaitingReview(
  memberIds: any[]
): Promise<Set<string>> {
  if (!memberIds.length) return new Set();
  const pending = await PaymentSubmission.find({
    memberId: { $in: memberIds },
    status: "pending",
  })
    .select("memberId")
    .lean<any[]>();
  return new Set(
    pending.map((submission) => submission.memberId?.toString()).filter(Boolean)
  );
}

/// True when this member has an unreviewed claim outstanding.
export async function hasPendingSubmission(memberId: any): Promise<boolean> {
  const count = await PaymentSubmission.countDocuments({
    memberId,
    status: "pending",
  });
  return count > 0;
}
