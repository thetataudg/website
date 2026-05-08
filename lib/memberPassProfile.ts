import Committee from "@/lib/models/Committee";
import Member from "@/lib/models/Member";

export type MemberPassProfile = {
  _id: string;
  rollNo: string;
  fName: string;
  lName: string;
  status?: string;
  profilePicUrl?: string;
  majors?: string[];
  minors?: string[];
  gradYear?: number;
  familyLine?: string;
  pledgeClass?: string;
  committees?: string[];
  hometown?: string;
  ecouncilPosition?: string;
};

async function appendCommitteeNames(memberId: string, committees?: string[]) {
  const committeeDocs = await Committee.find({
    $or: [{ committeeHeadId: memberId }, { committeeMembers: memberId }],
  })
    .select("name")
    .lean<{ name?: string }[]>();

  return Array.from(
    new Set(
      [
        ...(committees || []),
        ...committeeDocs
          .map((committee) => committee?.name?.trim() || "")
          .filter(Boolean),
      ].filter(Boolean)
    )
  );
}

export async function getMemberPassProfileByClerkId(clerkId: string) {
  const member = await Member.findOne({ clerkId })
    .select(
      "rollNo fName lName status profilePicUrl majors minors gradYear familyLine pledgeClass committees hometown ecouncilPosition"
    )
    .lean<MemberPassProfile | null>();

  if (!member || Array.isArray(member)) {
    return null;
  }

  return {
    ...member,
    _id: member._id.toString(),
    committees: await appendCommitteeNames(member._id.toString(), member.committees),
  };
}

export async function getMemberPassProfileById(memberId: string) {
  const member = await Member.findById(memberId)
    .select(
      "rollNo fName lName status profilePicUrl majors minors gradYear familyLine pledgeClass committees hometown ecouncilPosition"
    )
    .lean<MemberPassProfile | null>();

  if (!member || Array.isArray(member)) {
    return null;
  }

  return {
    ...member,
    _id: member._id.toString(),
    committees: await appendCommitteeNames(member._id.toString(), member.committees),
  };
}
