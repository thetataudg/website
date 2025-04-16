import Navbar from "./components/Navbar.js";
import { ClerkProvider } from "@clerk/nextjs";

import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
config.autoAddCss = false

import  "bootstrap/dist/css/bootstrap.min.css"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
    <html lang="en">
      <body>
        <Navbar />

        {children}

      </body>
    </html>
    </ClerkProvider>
  );
}
