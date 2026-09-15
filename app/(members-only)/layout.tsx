import type { Metadata } from "next";
import Navbar from "./components/Navbar";
import LockdownGuard from "./components/LockdownGuard";
import MembersOnlyAccessGate from "./components/MembersOnlyAccessGate";
import { ThemeProvider } from "./components/ThemeProvider";
import { ClerkProvider } from "@clerk/nextjs";

import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

import "./theme.css";
import "./members.css";

export const metadata: Metadata = {
  title: "Members",
  description:
    "Theta Tau Delta Gamma Chapter Tools for active members and leadership.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
            <MembersOnlyAccessGate>
              <Navbar />
              <LockdownGuard />
              {children}
            </MembersOnlyAccessGate>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
