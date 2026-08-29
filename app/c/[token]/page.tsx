// The landing page for an NFC check-in tag.
//
// On an iPhone with the app installed, this page is never seen: the universal
// link hands the tag straight to the app. Everybody else lands here — Android,
// and iPhones without the app — and gets checked in in the browser, which is
// why it sits outside `(members-only)` and handles being signed out itself
// rather than bouncing to a redirect that loses the token.
import type { Metadata } from "next";
import { APP_STORE_APP_ID } from "@/lib/appleAppSiteAssociation";
import BoothCheckInClient from "./BoothCheckInClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check in · Theta Tau",
  // Smart App Banner: on iOS Safari this is the "OPEN"/"VIEW" strip at the top
  // of the page, which is the install prompt for somebody who tapped a tag
  // without the app.
  other: { "apple-itunes-app": `app-id=${APP_STORE_APP_ID}` },
};

export default function BoothCheckInPage({
  params,
}: {
  params: { token: string };
}) {
  return <BoothCheckInClient token={params.token} />;
}
