// app/(members-only)/member/admin/profiles/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import ProfileCreator from "./ProfileCreator";

export default async function AdminProfilesPage() {
  const host = headers().get("host")!;
  const proto = process.env.VERCEL_ENV === "production" ? "https" : "http";
  const cookie = headers().get("cookie") ?? "";

  const res = await fetch(`${proto}://${host}/api/members`, {
    cache: "no-store",
    headers: { cookie },
  });
  if (!res.ok) throw new Error("Unable to fetch members");

  const members = await res.json();
  return <ProfileCreator initialMembers={members} />;
}
