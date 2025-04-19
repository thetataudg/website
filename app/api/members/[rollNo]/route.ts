import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";

export async function GET(
  _req: Request,
  { params }: { params: { rollNo: string } }
) {
  await connectDB();
  const member = await Member.findOne({ rollNo: params.rollNo }).lean();
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  return NextResponse.json(member);
}
