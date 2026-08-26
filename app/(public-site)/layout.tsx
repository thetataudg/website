import type { Metadata } from "next";
import Script from 'next/script';
import { ClerkProvider } from "@clerk/nextjs";
import { inter } from "../fonts";
import { siteUrl, absoluteUrl } from "@/lib/siteUrl";
import "reactflow/dist/style.css";

import "../(public-site)/globals.css";

import Navbar from "../(public-site)/components/Navbar.js";
import Footer from "../(public-site)/components/Footer.js";

const DESCRIPTION =
  "Theta Tau, Delta Gamma chapter is a coed professional engineering fraternity at Arizona State University in Tempe, AZ.";

export const metadata: Metadata = {
  // Every relative canonical and Open Graph URL on the site resolves against
  // this, so it has to be the live origin. siteUrl() is the one resolver the
  // sitemap and robots.txt use too, which is what keeps the three agreeing.
  metadataBase: new URL(siteUrl()),
  title: {
    default: "ASU Theta Tau - Delta Gamma Chapter",
    template: "%s | ASU Theta Tau - Delta Gamma Chapter",
  },
  description: DESCRIPTION,
  // No `alternates.canonical` here on purpose: metadata is inherited, so a
  // canonical set at the layout level would make every page on the site declare
  // itself a copy of whatever URL it named. Each route sets its own.
  openGraph: {
    title: "ASU Theta Tau - Delta Gamma Chapter",
    description: DESCRIPTION,
    // `url` is likewise per-route. It used to be pinned to "/" here, which told
    // crawlers and link unfurlers that every page was the homepage.
    siteName: "ASU Theta Tau - Delta Gamma Chapter",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: absoluteUrl("/og-default.jpg"),
        width: 1200,
        height: 630,
        alt: "Members of the Theta Tau Delta Gamma chapter at Arizona State University",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ASU Theta Tau - Delta Gamma Chapter",
    description: DESCRIPTION,
    images: [absoluteUrl("/og-default.jpg")],
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
