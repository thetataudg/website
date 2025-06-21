// app/(members-only)/member/admin/pending/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import PendingList from "./PendingList";

// ← use our own PendingRequest
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
  const host = headers().get("host")!;
  const proto = process.env.VERCEL_ENV === "production" ? "https" : "http";
  const cookie = headers().get("cookie") ?? "";
  const res = await fetch(`${proto}://${host}/api/members/pending`, {
    cache: "no-store",
    headers: {
      cookie,
    },
  });
  if (!res.ok) throw new Error("Unable to fetch pending requests");

  // cast to our interface
  const requests = (await res.json()) as PendingRequest[];
  return <PendingList initialRequests={requests} />;
}
