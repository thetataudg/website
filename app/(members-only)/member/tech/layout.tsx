// /member/tech: the committee task tracker (the tech committee by default,
// any committee with ?committee=<id>). The server gate keeps out anyone who
// is on no committee at all; the API re-checks the specific committee.
import { redirect } from "next/navigation";

import Committee from "@/lib/models/Committee";
import { isOfficerActor } from "@/lib/events/permissions";
import { serverMember } from "@/lib/serverMember";

import { TrackerProvider } from "./components/TrackerProvider";
import { TrackerChrome } from "./components/TrackerChrome";

export const dynamic = "force-dynamic";

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const member = await serverMember();
  // Signed out: the members-only gate sends them to sign-in with a return path.
  if (!member) return null;
  if (!isOfficerActor(member)) {
    const onAny = await Committee.exists({
      $or: [{ committeeHeadId: member._id }, { committeeMembers: member._id }],
    });
    if (!onAny) redirect("/member");
  }
  return (
    <TrackerProvider>
      <TrackerChrome>{children}</TrackerChrome>
    </TrackerProvider>
  );
}
