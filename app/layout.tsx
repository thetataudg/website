/* app/layout.tsx --------------------------------------------------------- */
import { ClerkProvider } from "@clerk/nextjs";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";

// export const metadata: Metadata = { title: "ΔΓ Chapter Tools" };
import "./(public-site)/globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* `signInUrl` points every Clerk redirect at the chapter's own sign-in
     * page rather than the hosted account portal. Set here rather than in the
     * environment so the three layouts that mount a provider cannot drift.
     *
     * The two fallbacks are where Clerk lands someone when nothing else named
     * a destination — an OAuth round trip, most often. Both are /member, not
     * one of them /member/onboard: /member already forwards anyone without a
     * profile to the onboarding form, so a first-time member and a returning
     * one can share one destination and still each get the right page. Leaving
     * them unset means Clerk uses "/", which is the public homepage. */
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/member"
      signUpFallbackRedirectUrl="/member"
      appearance={{
        /* customise if you like – `rootBox` is fine */
        elements: { rootBox: "container" },
      }}
    >
      <html
        lang="en"
        className={`${GeistSans.variable} ${GeistMono.variable}`}
        suppressHydrationWarning
      >
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
