import type { Metadata } from "next";
import Navbar from "./components/Navbar.js";
import LockdownGuard from "./components/LockdownGuard";
import { ClerkProvider } from "@clerk/nextjs";

import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

import "bootstrap/dist/css/bootstrap.min.css";
import "./members.css";

import { useEffect } from "react";

export const metadata: Metadata = {
  title: "Members",
  description:
    "Theta Tau Delta Gamma Chapter Tools for active members and leadership.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="members-shell" data-theme="light">
          <Navbar />
          <LockdownGuard />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
