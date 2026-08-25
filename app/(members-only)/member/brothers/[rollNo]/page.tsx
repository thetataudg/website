// app/(members-only)/member/brothers/[rollNo]/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import BrotherDetailClient from "./BrotherDetailClient";
import type { MemberDoc } from "@/types/member";
import MembershipRevokedState from "../../../components/MembershipRevokedState";

interface Params {
  params: { rollNo: string };
}

export default async function BrotherDetailPage({ params }: Params) {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  if (!host) {
    return <MembershipRevokedState description="You do not have permission to view this brother profile." />;
  }
  const forwardedProto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const base = `${proto}://${host}`;
  const cookie = headerList.get("cookie");

  const authRes = await fetch(`${base}/api/members/me`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });
  if (!authRes.ok) {
    return <MembershipRevokedState description="You do not have permission to view this brother profile." />;
  }
  const me = await authRes.json();
  const status = String(me.status || "").toLowerCase();
  const allowedStatus = status === "active" || status === "alumni";
  const restricted = !me.memberId || Boolean(me.pending) || !allowedStatus;
  if (restricted) {
    return <MembershipRevokedState description="You do not have permission to view this brother profile." />;
  }

  const res = await fetch(
    `${base}/api/members/${encodeURIComponent(params.rollNo)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return notFound();

  // cast JSON to our shared MemberDoc
  const member = (await res.json()) as MemberDoc;

  const committeesRes = await fetch(
    `${base}/api/committees?memberId=${encodeURIComponent(
      (member as any)._id
    )}`,
    {
      cache: "no-store",
    }
  );
  const committees = committeesRes.ok ? await committeesRes.json() : [];

  return <BrotherDetailClient member={member} committees={committees} />;
}

