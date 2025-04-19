import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getClerkUser } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import PendingMember from "@/lib/models/PendingMember";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req); // To test this on postman comment this line and use the below code.
    // clerkId = "user_2vxmTISqCX2tECCoGUvoLk4aLTb"; // This is a temp clerkid to test endpoint. Remove this line and uncomment the above in PRODUCTION
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
    majors = [],
    gradYear,
    bio = "",
    committees = [],
    familyLine = "",
    pledgeClass = "",
    isECouncil,
    ecouncilPosition = "",
    hometown = "",
    resumeUrl = "",
    profilePicUrl = "",
    socialLinks = {},
  } = await req.json();

  if (!rollNo || !gradYear || typeof isECouncil !== "boolean") {
    return NextResponse.json(
      { error: "Missing required fields: rollNo, gradYear, isECouncil" },
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

    const pending = await PendingMember.create({
      clerkId,
      rollNo,
      fName,
      lName,
      majors,
      gradYear,
      bio,
      committees,
      familyLine,
      pledgeClass,
      isECouncil,
      ecouncilPosition,
      hometown,
      resumeUrl,
      profilePicUrl,
      socialLinks,
      status: "pending",
    });

    logger.info("New onboarding submitted", { clerkId, rollNo });
    return NextResponse.json({ id: pending._id }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Onboard submission failed");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
