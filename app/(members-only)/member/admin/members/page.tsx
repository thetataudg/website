// app/(members-only)/member/admin/members/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";

import MembersList from "./MembersList";
import type { MemberData } from "./MembersList";

export default async function MembersPage() {
  const host = headers().get("host")!;
  const proto = process.env.VERCEL_ENV === "production" ? "https" : "http";
  const cookie = headers().get("cookie") ?? "";
  const res = await fetch(`${proto}://${host}/api/members`, {
    cache: "no-store",
    headers: {
      cookie,
    },
  });
  if (!res.ok) throw new Error("Unable to fetch members");
  const members: MemberData[] = await res.json();
  return <MembersList initialMembers={members} />;
}
