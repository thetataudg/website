// /member/tech → the default view: Board for the head, My tasks for everyone else.
import { redirect } from "next/navigation";

import Committee from "@/lib/models/Committee";
import { getTechCommittee } from "@/lib/committeeQueries";
import { serverMember } from "@/lib/serverMember";
import { canManageTracker } from "@/lib/tasks/permissions";

export const dynamic = "force-dynamic";

export default async function TechIndex({ searchParams }: { searchParams: { committee?: string } }) {
  const member = await serverMember();
  if (!member) return null;
  const id = searchParams.committee;
  const committee =
    id && /^[a-f0-9]{24}$/i.test(id) ? await Committee.findById(id).lean<any>() : await getTechCommittee();
  const view = committee && canManageTracker(member, committee) ? "board" : "mine";
  redirect(`/member/tech/${view}${id ? `?committee=${encodeURIComponent(id)}` : ""}`);
}
