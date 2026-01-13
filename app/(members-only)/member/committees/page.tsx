// app/(members-only)/member/committees/page.tsx
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import CommitteesClient from "./CommitteesClient";

export default async function CommitteesPage() {
  const headerList = headers();
  const cookie = headerList.get("cookie") ?? "";
  const forwardedProto = headerList.get("x-forwarded-proto");
  const forwardedHost = headerList.get("x-forwarded-host");
  const host = forwardedHost ?? headerList.get("host");
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (host ? `${forwardedProto ?? "https"}://${host}` : "");

  let committees = [];
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/committees`, {
        cache: "no-store",
        headers: { cookie },
      });
      if (res.ok) {
        committees = await res.json();
      } else {
        console.error("Failed to load committees", res.status, await res.text());
      }
    } catch (err) {
      console.error("Failed to load committees", err);
    }
  } else {
    console.error("Failed to resolve base URL for committees fetch");
  }
  return <CommitteesClient committees={committees} />;
}
