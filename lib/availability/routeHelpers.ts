// lib/availability/routeHelpers.ts
// The bits every availability route repeats: who is calling, and may they
// manage this poll.
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import AvailabilityPoll from "@/lib/models/AvailabilityPoll";
import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";
import { isEventScopeManager } from "@/lib/eventAuth";

export async function currentMember(req: Request) {
  const clerkId = await requireAuth(req as any);
  await connectDB();
  const member = await Member.findOne({ clerkId }).lean<any>();
  if (!member || Array.isArray(member)) {
    throw new Error("Not authorized");
  }
  return member;
}

export interface PollContext {
  poll: any;
  committee: any | null;
  isManager: boolean;
  isInvitee: boolean;
}

export async function loadPollContext(
  pollId: string,
  member: any
): Promise<PollContext | null> {
  const poll = await AvailabilityPoll.findById(pollId).lean<any>();
  if (!poll) return null;
  const committee = poll.committeeId
    ? await Committee.findById(poll.committeeId).lean<any>()
    : null;
  const me = member._id?.toString();
  return {
    poll,
    committee,
    isManager:
      isEventScopeManager(member as any, committee) ||
      poll.createdBy?.toString() === me,
    isInvitee: (poll.invitees || []).some(
      (i: any) => i.memberId?.toString() === me
    ),
  };
}
