import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import Head from 'next/head';
import Script from 'next/script';
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";

import Navbar from "../components/Navbar.js";
import Footer from "../components/Footer.js";

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
  title: "ASU Theta Tau - Delta Gamma Chapter",
  description:
    "Theta Tau, Delta Gamma chapter is a coed professional engineering fraternity at Arizona State University in Tempe, AZ.",
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
