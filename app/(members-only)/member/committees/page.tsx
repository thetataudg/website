// app/(members-only)/member/committees/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import CommitteesClient from "./CommitteesClient";

export default async function CommitteesPage() {
  const host = headers().get("host")!;
  const proto = process.env.VERCEL_ENV === "production" ? "https" : "http";
  const cookie = headers().get("cookie") ?? "";

  const res = await fetch(`${proto}://${host}/api/committees`, {
    cache: "no-store",
    headers: { cookie },
  });

  if (!res.ok) {
    throw new Error("Failed to load committees");
  }

  const committees = await res.json();
  return <CommitteesClient committees={committees} />;
}
