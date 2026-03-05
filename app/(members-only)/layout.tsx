import type { Metadata } from "next";
import Navbar from "./components/Navbar.js";
import LockdownGuard from "./components/LockdownGuard";

import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

import "bootstrap/dist/css/bootstrap.min.css";
import "./members.css";

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
    <div className="members-shell" data-theme="light">
      <Navbar />
      <LockdownGuard />
      {children}
    </div>
  );
}
