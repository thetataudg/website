import { NextResponse } from "next/server";
import {
  APPLE_PAY_DOMAIN_ASSOCIATION,
  applePayDomainAssociationConfigured,
} from "@/lib/applePayDomainAssociation";

export const runtime = "nodejs";

/// Apple's domain check for Apple Pay on the web.
///
/// Served from a route handler rather than `public/` because this app has no
/// static `.well-known` directory — the app-site-association file next door is
/// a route too, and that one is proven in production, so this matches it
/// deliberately.
///
/// Must be plain text: Apple compares the body byte for byte and a JSON
/// wrapper, a trailing newline from an editor, or a Next.js HTML error page
/// all read the same way to it, as "this domain is not verified".
export function GET() {
  if (!applePayDomainAssociationConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(APPLE_PAY_DOMAIN_ASSOCIATION.trim(), {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=300",
    },
  });
}
