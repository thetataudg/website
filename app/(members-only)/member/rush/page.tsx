// /member/rush: the rush chair's editor for the public /rush page.
import { redirect } from "next/navigation";

import { serverMember } from "@/lib/serverMember";
import { canEditRushPage } from "@/lib/rush/permissions";
import { getRushEditorState } from "@/lib/rush/service";

import RushEditorClient from "./RushEditorClient";

export const dynamic = "force-dynamic";

export default async function RushEditorPage() {
  const member = await serverMember();
  // Signed out: the members-only gate sends them to sign-in with a return path.
  if (!member) return null;
  if (!(await canEditRushPage(member))) redirect("/member");
  const state = await getRushEditorState();
  return <RushEditorClient initial={JSON.parse(JSON.stringify(state))} />;
}
