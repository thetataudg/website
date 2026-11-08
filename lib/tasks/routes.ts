// lib/tasks/routes.ts
// The try/catch every tracker and bug route repeats.
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import logger from "@/lib/logger";
import { currentMember } from "@/lib/availability/routeHelpers";

export async function handle(
  req: Request,
  label: string,
  fn: (member: any) => Promise<unknown>,
  status = 200
) {
  try {
    const member = await currentMember(req);
    return NextResponse.json(await fn(member), { status });
  } catch (err: any) {
    // 4xx are refusals, not crashes; apiErrorResponse reports them itself.
    if (!(err?.statusCode >= 400 && err?.statusCode < 500)) logger.error({ err }, label);
    return apiErrorResponse(err);
  }
}

export async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
