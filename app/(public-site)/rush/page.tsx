// app/(public-site)/rush/page.tsx
// The public rush page, edited by the rush chair at /member/rush.
//
// A server component so the content comes from the RushPage document (or the
// defaults, which are the page as it was hardcoded) and the dates are
// formatted in Phoenix here rather than in whatever timezone the visitor's
// browser is in. Saving in the editor calls `revalidatePath("/rush")`; the
// five-minute revalidate is the backstop.
import type { Metadata } from "next";

import logger from "@/lib/logger";
import { pageMetadata } from "@/lib/seo";
import { RUSH_DEFAULTS } from "@/lib/rush/defaults";
import { remainingEvents, toRushView } from "@/lib/rush/format";
import { getRushPageData } from "@/lib/rush/service";
import type { RushPageData } from "@/lib/rush/types";

import RushClient from "./RushClient";

export const revalidate = 300;

async function loadPage(): Promise<RushPageData> {
  try {
    return await getRushPageData();
  } catch (err: any) {
    // A database hiccup should cost the page its latest edits, not the page.
    logger.error({ err }, "Rush page fell back to defaults");
    return RUSH_DEFAULTS;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await loadPage();
  const lead = data.eyebrow ? `${data.eyebrow}: r` : "R";
  return pageMetadata({
    title: "Rush",
    description: `${lead}ush events and recruitment details for Theta Tau Delta Gamma.`,
    path: "/rush",
  });
}

export default async function RushPage() {
  const page = toRushView(await loadPage());
  const initialRemainingKeys = remainingEvents(page.events).map((event) => event.key);
  return <RushClient page={page} initialRemainingKeys={initialRemainingKeys} />;
}
