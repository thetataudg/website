import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { NextRequest } from "next/server";
import Member from "@/lib/models/Member";

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message = "Unauthorized") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(message = "Forbidden") {
    super(message);
  }
}

export async function requireRole(
  req: NextRequest,
  roles: ("superadmin" | "admin" | "member")[]
) {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();

  const member = await Member.findOne({ clerkId: userId });
  if (!member || !roles.includes(member.role as any)) {
    throw new ForbiddenError();
  }

  return member;
}

export async function getUserIdFromRequest(req: NextRequest): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

export async function requireAuth(req: NextRequest): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

export async function requireAdmin(req: NextRequest): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();

  const member = await Member.findOne({ clerkId: userId });
  if (!member || !member.isAdmin) {
    throw new ForbiddenError("User is not an admin");
  }

  return userId;
}

export async function getClerkUser(clerkId: string) {
  return await clerkClient.users.getUser(clerkId);
}
