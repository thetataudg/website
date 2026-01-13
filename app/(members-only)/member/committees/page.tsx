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
  let errorMessage: string | null = null;
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/committees`, {
        cache: "no-store",
        headers: { cookie },
      });
      if (res.ok) {
        committees = await res.json();
      } else {
        const body = await res.text();
        console.error("Failed to load committees", res.status, body);
        errorMessage = "Unable to load committees right now.";
      }
    } catch (err) {
      console.error("Failed to load committees", err);
      errorMessage = "Unable to load committees right now.";
    }
  } else {
    console.error("Failed to resolve base URL for committees fetch");
    errorMessage = "Unable to load committees right now.";
  }
  return <CommitteesClient committees={committees} error={errorMessage} />;
}
