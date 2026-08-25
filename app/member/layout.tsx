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
    <ClerkProvider>
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
