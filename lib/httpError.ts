// lib/httpError.ts
// An error that carries its own status. `apiErrorResponse` honours any 4xx
// `statusCode`, so service-layer code can throw these and every caller (API
// route, MCP tool, cron) turns them into the same answer.
export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);
export const badRequest = (why: string) => new HttpError(400, why);
export const forbidden = (why = "Not allowed") => new HttpError(403, why);
