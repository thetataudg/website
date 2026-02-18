// app/(members-only)/member/brothers/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import MembersList, { MemberData } from "./MembersList";

export default async function BrothersPage() {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  if (!host) {
    return <Unauthorized />;
  }
  const forwardedProto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const base = `${proto}://${host}`;
  const cookie = headerList.get("cookie");

  const meRes = await fetch(`${base}/api/members/me`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });
  if (!meRes.ok) {
    return <Unauthorized />;
  }
  const me = await meRes.json();
  const status = String(me.status || "").toLowerCase();
  const allowedStatus = status === "active" || status === "alumni";
  const isRestricted = !me.memberId || Boolean(me.pending) || !allowedStatus;
  if (isRestricted) {
    return <Unauthorized />;
  }

  const res = await fetch(`${base}/api/members`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

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

function Unauthorized() {
  return (
    <div className="member-dashboard">
      <div className="bento-card text-center">
        <h2>Unauthorized</h2>
        <p className="text-muted">
          You do not have permission to view the brothers directory.
        </p>
      </div>
    </div>
  );
}
