// lib/serverMember.ts
// The signed-in member for a server component, or null. Pages use it for
// their server-side gate; API routes use `currentMember(req)` instead.
import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";

export async function serverMember(): Promise<any | null> {
  const { userId } = await auth();
  if (!userId) return null;
  await connectDB();
  const member = await Member.findOne({ clerkId: userId }).lean<any>();
  return member && !Array.isArray(member) ? member : null;
}
