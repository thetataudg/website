export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import Member from "@/lib/models/Member";
import PendingList from "./PendingList";
import { listPendingMailRequests } from "@/lib/mail/requests";
import { mailDomain } from "@/lib/mail/address";

interface PendingRequest {
  placeholderMatch?: { rollNo: string; fName: string; lName: string } | null;
  requestType?: "access" | "deletion";
  _id: string;
  clerkId: string;
  rollNo: string;
  fName: string;
  lName: string;
  headline?: string;
  pronouns?: string;
  majors?: string[];
  minors?: string[];
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
  gradYear?: number;
  bio?: string;
  pledgeClass?: string;
  hometown?: string;
  skills?: string[];
  funFacts?: string[];
  projects?: Array<{ title?: string; description?: string; link?: string }>;
  work?: Array<{
    title?: string;
    organization?: string;
    start?: string;
    end?: string;
    description?: string;
    link?: string;
  }>;
  awards?: Array<{
    title?: string;
    issuer?: string;
    date?: string;
    description?: string;
  }>;
  customSections?: Array<{ title?: string; body?: string }>;
  socialLinks?: Record<string, string>;
}

export default async function PendingPage() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthenticated");

  await connectDB();
  const user = await Member.findOne({ clerkId: userId });
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    throw new Error("Unauthorized");
  }

  const rawRequests = await PendingMember.find({ status: "pending" }).lean();

  // Placeholder profiles (no account yet) whose roll matches a request, so
  // the reviewer can see that approving will claim that profile.
  const placeholders = await Member.find({
    rollNo: { $in: rawRequests.map((r: any) => r.rollNo) },
    clerkId: { $not: { $type: "string" } },
  })
    .select("rollNo fName lName")
    .lean<any[]>();
  const placeholderByRoll = new Map(placeholders.map((p) => [p.rollNo, p]));

  const requests: PendingRequest[] = rawRequests.map((r: any) => ({
    placeholderMatch: placeholderByRoll.has(r.rollNo)
      ? {
          rollNo: r.rollNo,
          fName: placeholderByRoll.get(r.rollNo).fName,
          lName: placeholderByRoll.get(r.rollNo).lName,
        }
      : null,
    requestType: r.requestType || "access",
    _id: r._id.toString(),
    clerkId: r.clerkId,
    rollNo: r.rollNo,
    fName: r.fName,
    lName: r.lName,
    headline: r.headline,
    pronouns: r.pronouns,
    majors: r.majors || [],
    minors: r.minors || [],
    status: r.status,
    submittedAt: r.submittedAt,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
    reviewComments: r.reviewComments,
    gradYear: r.gradYear,
    bio: r.bio,
    pledgeClass: r.pledgeClass,
    hometown: r.hometown,
    skills: r.skills || [],
    funFacts: r.funFacts || [],
    projects: r.projects || [],
    work: r.work || [],
    awards: r.awards || [],
    customSections: r.customSections || [],
    socialLinks:
      r.socialLinks && typeof r.socialLinks === "object"
        ? r.socialLinks instanceof Map
          ? Object.fromEntries(r.socialLinks)
          : r.socialLinks
        : {},
  }));

  const mailRequests = await listPendingMailRequests();

  return (
    <PendingList
      initialRequests={requests}
      initialMailRequests={mailRequests}
      mailDomain={mailDomain()}
    />
  );
}
