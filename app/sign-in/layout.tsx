import type { Metadata } from "next";

import "../(members-only)/theme.css";
import "../(members-only)/members.css";
import { ThemeProvider } from "../(members-only)/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Theta Tau Delta Gamma chapter tools.",
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico" },
  // A sign-in page has nothing to offer a search engine and everything to lose
  // by being indexed under the chapter's name.
  robots: { index: false, follow: false },
};

/// Sign-in borrows the members-area theme rather than the public site's, so
/// the page a member signs in on looks like the tools they are signing in to.
///
/// No `<html>` of its own: this sits under the root layout, which already
/// renders the document and the Clerk provider.
export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div className="members-shell min-h-screen bg-background">{children}</div>
    </ThemeProvider>
  );
}
