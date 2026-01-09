// app/(members-only)/member/profile/[rollNo]/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ProfileClient from "./ProfileClient";
import type { MemberDoc } from "@/types/member";

interface Props {
  params: { rollNo: string };
}

export default async function ProfilePage({ params }: Props) {
  const host = headers().get("host")!;
  const proto = process.env.VERCEL_ENV === "production" ? "https" : "http";
  const base = `${proto}://${host}`;
  const cookie = headers().get("cookie") ?? "";

  const res = await fetch(`${base}/api/members/${params.rollNo}`, {
    cache: "no-store",
  });
  if (!res.ok) return notFound();
  const member = (await res.json()) as MemberDoc;

  const committeesRes = await fetch(
    `${base}/api/committees?memberId=${encodeURIComponent(
      (member as any)._id
    )}`,
    {
      cache: "no-store",
      headers: { cookie },
    }
  );
  const committees = committeesRes.ok ? await committeesRes.json() : [];

  return <ProfileClient member={member} committees={committees} />;
}
