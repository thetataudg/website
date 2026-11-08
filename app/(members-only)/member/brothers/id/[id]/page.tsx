// /member/brothers/id/<memberId>: a stable link to a brother by database id
// (what @mentions store), forwarded to the roll-number profile.
import { notFound, redirect } from "next/navigation";
import { isValidObjectId } from "mongoose";

import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import { serverMember } from "@/lib/serverMember";

export const dynamic = "force-dynamic";

export default async function BrotherById({ params }: { params: { id: string } }) {
  if (!(await serverMember())) notFound();
  if (!isValidObjectId(params.id)) notFound();
  await connectDB();
  const member = await Member.findById(params.id).select("rollNo").lean<any>();
  if (!member?.rollNo) notFound();
  redirect(`/member/brothers/${encodeURIComponent(member.rollNo)}`);
}
