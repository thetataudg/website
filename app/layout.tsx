/* app/layout.tsx --------------------------------------------------------- */
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";

export const metadata: Metadata = { title: "ΔΓ Chapter Tools" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        /* customise if you like – `rootBox` is fine */
        elements: { rootBox: "container" },
      }}
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
