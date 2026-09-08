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
     * environment so the three layouts that mount a provider cannot drift. */
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
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
