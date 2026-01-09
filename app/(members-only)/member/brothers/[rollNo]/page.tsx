// app/(members-only)/member/brothers/[rollNo]/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import BrotherDetailClient from "./BrotherDetailClient";
import type { MemberDoc } from "@/types/member";

interface Params {
  params: { rollNo: string };
}

export default async function BrotherDetailPage({ params }: Params) {
  // build absolute URL for SSR fetch
  const host = headers().get("host")!;
  const proto = process.env.VERCEL_ENV === "production" ? "https" : "http";
  const base = `${proto}://${host}`;
  const cookie = headers().get("cookie") ?? "";

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
      headers: { cookie },
    }
  );
  const committees = committeesRes.ok ? await committeesRes.json() : [];

  return <BrotherDetailClient member={member} committees={committees} />;
}
