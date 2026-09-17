// lib/mail/avatars.ts
// Who is behind the chapter addresses in a conversation.
//
// Only addresses on our own domain are looked up: a personal chapter mailbox
// resolves to its member and their profile photo, a committee mailbox to the
// committee. Outside senders get nothing, so the viewer draws initials and no
// guessing is done about strangers.
import MailAccount from "@/lib/models/MailAccount";
import Committee from "@/lib/models/Committee";
import { maybePresignUrl } from "@/lib/garage";
import { bareAddress, isOurDomain } from "@/lib/mail/address";

export interface MailPerson {
  kind: "member" | "committee";
  name: string;
  /// A signed photo URL for a member who has one.
  photoUrl: string | null;
  rollNo: string | null;
}

export async function resolveMailPeople(addresses: string[]): Promise<Record<string, MailPerson>> {
  const ours = Array.from(new Set(addresses.map(bareAddress).filter((a) => a && isOurDomain(a))));
  if (!ours.length) return {};

  const accounts = await MailAccount.find({ address: { $in: ours }, status: { $in: ["active", "suspended"] } })
    .populate("memberId", "fName lName profilePicUrl rollNo")
    .select("address kind memberId committeeId")
    .lean<any[]>();
  const committeeIds = accounts.filter((a) => a.kind === "role" && a.committeeId).map((a) => a.committeeId);
  const committees = committeeIds.length
    ? await Committee.find({ _id: { $in: committeeIds } }).select("name").lean<any[]>()
    : [];
  const committeeName = new Map(committees.map((c) => [String(c._id), c.name]));

  const entries = await Promise.all(
    accounts.map(async (a): Promise<[string, MailPerson] | null> => {
      if (a.kind === "role") {
        return [bareAddress(a.address), { kind: "committee", name: committeeName.get(String(a.committeeId)) ?? a.address, photoUrl: null, rollNo: null }];
      }
      const m = a.memberId;
      if (!m) return null;
      return [
        bareAddress(a.address),
        {
          kind: "member",
          name: `${m.fName ?? ""} ${m.lName ?? ""}`.trim(),
          photoUrl: (await maybePresignUrl(m.profilePicUrl)) ?? null,
          rollNo: m.rollNo ?? null,
        },
      ];
    })
  );
  return Object.fromEntries(entries.filter((e): e is [string, MailPerson] => Boolean(e)));
}
