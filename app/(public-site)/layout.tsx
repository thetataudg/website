import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import Script from 'next/script';
import { ClerkProvider } from "@clerk/nextjs";

import "../(public-site)/globals.css";

import Navbar from "../(public-site)/components/Navbar.js";
import Footer from "../(public-site)/components/Footer.js";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
  weight: "300",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000"
  ),
  title: {
    default: "ASU Theta Tau - Delta Gamma Chapter",
    template: "%s | ASU Theta Tau - Delta Gamma Chapter",
  },
  description:
    "Theta Tau, Delta Gamma chapter is a coed professional engineering fraternity at Arizona State University in Tempe, AZ.",
  openGraph: {
    title: "ASU Theta Tau - Delta Gamma Chapter",
    description:
      "Theta Tau, Delta Gamma chapter is a coed professional engineering fraternity at Arizona State University in Tempe, AZ.",
    url: "/",
    siteName: "ASU Theta Tau - Delta Gamma Chapter",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ASU Theta Tau - Delta Gamma Chapter",
    description:
      "Theta Tau, Delta Gamma chapter is a coed professional engineering fraternity at Arizona State University in Tempe, AZ.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
    <html lang="en">
      <body className={inter.className}>
        {/* External Google Tag Manager script */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-R1HDPDN1XG"
          strategy="beforeInteractive"
        />

        {/* Inline Google Tag Manager setup */}
        <Script id="gtag-init" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-R1HDPDN1XG');
          `}
        </Script>

        <Navbar />

        {children}
            
        <Footer />
      </body>
    </html>
    </ClerkProvider>
  );
}
