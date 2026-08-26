import type { Metadata } from "next";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

// This used to build metadata by fetching its own /api/members/[rollNo] over
// HTTP, against `NEXT_PUBLIC_BASE_URL || "https://thetatauasu.org"`. That env
// var is set nowhere, so in production every profile called out to a domain the
// chapter left two moves ago, the fetch failed, and all of them fell back to the
// same generic title. Reading the database directly removes the round trip and
// the stale hostname at once.
export async function generateMetadata({
  params,
}: {
  params: { rollNo: string };
}): Promise<Metadata> {
  // These pages are intentionally excluded from search: they carry students'
  // names, majors, grad years, and resume links. app/robots.ts disallows
  // /brother as well; this is the belt to that suspenders, because a page that
  // is linked from elsewhere can still be indexed without a noindex on it.
  const robots = { index: false, follow: true } as const;

  try {
    await connectDB();
    const member = await Member.findOne({ rollNo: params.rollNo })
      .select("fName lName headline majors")
      .lean<{
        fName?: string;
        lName?: string;
        headline?: string;
        majors?: string[];
      }>();

    if (!member) {
      throw new Error(`No member with roll number ${params.rollNo}`);
    }

    const fullName = `${member.fName ?? ""} ${member.lName ?? ""}`.trim();
    const detail =
      member.headline || member.majors?.join(", ") || "Engineering student";

    return {
      title: fullName || "Brother Profile",
      description: `View ${fullName || "this brother"}'s profile for the Theta Tau Delta Gamma chapter at ASU. ${detail}`,
      robots,
    };
  } catch (error) {
    logger.warn({ error, rollNo: params.rollNo }, "Falling back to generic brother metadata");
    return {
      title: "Brother Profile",
      description:
        "View a brother profile for the Theta Tau Delta Gamma chapter at ASU.",
      robots,
    };
  }
}

export default function BrotherProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
