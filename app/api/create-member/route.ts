// // app/api/create-member/route.ts
// import { NextResponse, NextRequest } from "next/server";
// import { getAuth } from "@clerk/nextjs/server";
// import mongoose from "mongoose";
// import Member from "@/lib/models/Member";
// import { connectDB } from "@/lib/db";

// export async function POST(req: NextRequest) {
//   const auth = getAuth(req);
//   const { userId } = auth;

//   if (!userId) {
//     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//   }

//   await connectDB();

//   try {
//     const body = await req.json();

//     // Validate required fields first
//     const requiredFields = ["fName", "lName", "rollNo", "gradYear"];
//     const missingFields = requiredFields.filter((field) => !body[field]);
//     if (missingFields.length > 0) {
//       return NextResponse.json(
//         { error: `Missing required fields: ${missingFields.join(", ")}` },
//         { status: 400 }
//       );
//     }

//     // Convert relationships to ObjectIds
//     const big = body.big ? new mongoose.Types.ObjectId(body.big) : null;
//     const littles = Array.isArray(body.littles)
//       ? body.littles.map((l: string) => new mongoose.Types.ObjectId(l))
//       : [];

//     const newMember = new Member({
//       clerkId: userId,
//       fName: body.fName,
//       lName: body.lName,
//       rollNo: String(body.rollNo),
//       majors: body.majors,
//       gradYear: Number(body.gradYear),
//       bigs: big ? [big] : [],
//       littles,
//       familyLine: body.familyLine,
//       resumeUrl: body.resumeUrl,
//       pledgeClass: body.pledgeClass,
//       isECouncil: body.isElected === "on", // Convert checkbox value
//       ecouncilPosition: body.ecouncilPosition,
//       committees: body.committees,
//       socialLinks: {
//         linkedin: body.linkedin,
//         github: body.github,
//       },
//       status: body.status,
//     });

//     await newMember.save();
//     return NextResponse.json(
//       { message: "Profile created successfully!" },
//       { status: 201 }
//     );
//   } catch (error) {
//     console.error(error);
//     return NextResponse.json(
//       {
//         error: error instanceof Error ? error.message : "Internal Server Error",
//       },
//       { status: 500 }
//     );
//   }
// }
