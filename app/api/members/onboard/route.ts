// api/members/onboard
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getClerkUser } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { normalizePhone } from "@/lib/phone";

export async function POST(req: NextRequest) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req); // To test this on postman comment this line and use the below code.
    // clerkId = "user_2wCfjfKbNJhzDCEsWAt4RPhxgMd"; // This is a temp clerkid to test endpoint. Remove this line and uncomment the above in PRODUCTION
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }

  const clerkUser = await getClerkUser(clerkId);
  const fName = clerkUser.firstName || "";
  const lName = clerkUser.lastName || "";

  const {
    rollNo,
    phone = "",
    headline = "",
    pronouns = "",
    majors = [],
    minors = [],
    gradYear,
    bio = "",
    pledgeClass = "",
    skills = [],
    funFacts = [],
    projects = [],
    work = [],
    awards = [],
    customSections = [],
    committees = [],
    familyLine = "",
    isECouncil = false,
    ecouncilPosition = "",
    hometown = "",
    resumeUrl = "",
    profilePicUrl = "",
    socialLinks = {},
    alumni = false,
  } = await req.json();

  if (!rollNo || !gradYear) {
    return NextResponse.json(
      { error: "Missing required fields: rollNo, gradYear" },
      { status: 400 }
    );
  }

  // Mandatory here rather than on the schema: this is the only path that
  // creates a request, and a schema-level requirement would break rejecting
  // the ones that predate the field.
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone.ok) {
    return NextResponse.json({ error: normalizedPhone.error }, { status: 400 });
  }
  if (!normalizedPhone.e164) {
    return NextResponse.json(
      { error: "A phone number is required." },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    if (await PendingMember.exists({ clerkId })) {
      return NextResponse.json(
        { error: "You have already submitted your profile." },
        { status: 409 }
      );
    }

    // A profile with no account behind it is a placeholder waiting to be
    // claimed, and approval merges into it. Only a roll someone has already
    // claimed is a conflict.
    if (await Member.exists({ rollNo: String(rollNo).trim(), clerkId: { $type: "string" } })) {
      return NextResponse.json(
        { error: "That roll number already belongs to an account. Ask an officer if it's yours." },
        { status: 409 }
      );
    }

    const pending = await PendingMember.create({
      requestType: "access",
      clerkId,
      rollNo,
      fName,
      lName,
      phone: normalizedPhone.e164,
      headline,
      pronouns,
      majors,
      minors,
      gradYear,
      bio,
      pledgeClass,
      skills,
      funFacts,
      projects,
      work,
      awards,
      customSections,
      committees,
      familyLine,
      isECouncil,
      ecouncilPosition,
      hometown,
      resumeUrl,
    profilePicUrl,
    socialLinks,
    status: "pending",
    // Only a suggestion: the reviewing officer sees it pre-filled on the
    // Status select and can change it before approving.
    preferredStatus: alumni === true ? "Alumni" : "Active",
    preferredRole: "member",
  });

    logger.info({
      event: "New onboarding submitted",
      clerkId,
      rollNo,
    });
    return NextResponse.json({ id: pending._id }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Onboard submission failed");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
