// lib/mail/requests.ts
// Chapter email requests as the admin queue sees them.
import MailAccount from "@/lib/models/MailAccount";

export interface MailRequestRow {
  _id: string;
  requestType: "email";
  memberId: string;
  rollNo: string;
  fName: string;
  lName: string;
  address: string;
  localPart: string;
  memberStatus: string;
  submittedAt: string;
}

export async function listPendingMailRequests(): Promise<MailRequestRow[]> {
  const rows = await MailAccount.find({ status: "pending" })
    .sort({ requestedAt: 1 })
    .populate("memberId", "rollNo fName lName status")
    .lean<any[]>();
  return rows
    .filter((r) => r.memberId)
    .map((r) => ({
      _id: String(r._id),
      requestType: "email" as const,
      memberId: String(r.memberId._id),
      rollNo: r.memberId.rollNo,
      fName: r.memberId.fName,
      lName: r.memberId.lName,
      address: r.address,
      localPart: r.localPart,
      memberStatus: r.memberId.status,
      submittedAt: new Date(r.requestedAt).toISOString(),
    }));
}
