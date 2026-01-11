import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "Member Portal",
  description:
    "Chapter tools for Theta Tau Delta Gamma members at Arizona State University.",
};

import "bootstrap/dist/css/bootstrap.min.css";
import "../(members-only)/members.css";
import Navbar from "../(members-only)/components/Navbar.js";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="members-shell" data-theme="light">
          <Navbar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
