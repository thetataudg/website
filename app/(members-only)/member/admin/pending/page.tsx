export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import Member from "@/lib/models/Member";
import PendingList from "./PendingList";

interface PendingRequest {
  _id: string;
  clerkId: string;
  rollNo: string;
  fName: string;
  lName: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
}

export default async function PendingPage() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  await connectDB();
  const user = await Member.findOne({ clerkId: userId });
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    throw new Error("Not authorized");
  }

  const rawRequests = await PendingMember.find({ status: "pending" }).lean();
  const requests: PendingRequest[] = rawRequests.map((r: any) => ({
    _id: r._id.toString(),
    clerkId: r.clerkId,
    rollNo: r.rollNo,
    fName: r.fName,
    lName: r.lName,
    status: r.status,
    submittedAt: r.submittedAt,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
    reviewComments: r.reviewComments,
  }));

  return <PendingList initialRequests={requests} />;
}