import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Member Portal",
  description:
    "Chapter tools for Theta Tau Delta Gamma members at Arizona State University.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

import "../(members-only)/theme.css";
import "../(members-only)/members.css";
import Navbar from "../(members-only)/components/Navbar";
import { ThemeProvider } from "../(members-only)/components/ThemeProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* Both fallbacks point at /member rather than one of them at
     * /member/onboard: /member already sends anyone without a profile on to
     * the onboarding form, so a single destination cannot disagree with it.
     * Without these, Clerk falls back to "/" and a member who has just signed
     * in lands on the public homepage. */
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/member"
      signUpFallbackRedirectUrl="/member"
    >
      <html lang="en" suppressHydrationWarning>
        <body className="members-shell">
          <ThemeProvider>
            <Navbar />
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
