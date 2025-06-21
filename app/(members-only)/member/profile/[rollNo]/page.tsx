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

  const res = await fetch(`${base}/api/members/${params.rollNo}`, {
    cache: "no-store",
  });
  if (!res.ok) return notFound();
  const member = (await res.json()) as MemberDoc;

  return <ProfileClient member={member} />;
}
