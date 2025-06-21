// app/(members-only)/member/brothers/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import MembersList, { MemberData } from "./MembersList";

export default async function BrothersPage() {
  // build absolute URL for SSR
  const host = headers().get("host")!;
  const proto = process.env.VERCEL_ENV === "production" ? "https" : "http";
  const base = `${proto}://${host}`;

  // fetch the entire list of members
  const res = await fetch(`${base}/api/members`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch members");
  }
  const allMembers = (await res.json()) as any[];

  // drop the super-admin and shape into your MemberData
  const members: MemberData[] = allMembers
    .filter((m) => m.rollNo !== "000-ADMIN")
    .map((m) => ({
      rollNo: m.rollNo,
      fName: m.fName,
      lName: m.lName,
      majors: m.majors,
      profilePicUrl: m.profilePicUrl ?? undefined,
      socialLinks: m.socialLinks ?? undefined,
      status: m.status,
    }));

  return <MembersList initialMembers={members} />;
}
