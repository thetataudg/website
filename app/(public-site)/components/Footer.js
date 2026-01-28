"use client"; // ref: https://stackoverflow.com/questions/74965849/youre-importing-a-component-that-needs-usestate-it-only-works-in-a-client-comp

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Bungee } from "next/font/google";
import Link from "next/link";
import React from "react";
import Image from "next/image";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const Footer = () => {
  return (
    <footer className="bg-[#120a0a] px-4 pb-0 pt-12 text-[#1b0f0f]">
      <div className="mx-auto w-full max-w-[1400px] rounded-[32px] bg-[#fbf6dc] px-8 py-12 shadow-[0_14px_32px_rgba(0,0,0,0.4)] sm:px-12">
        <div className="grid gap-10 lg:grid-cols-[auto,1fr] lg:items-start">
          <div className="flex items-center gap-6">
            <Image
              src="/crest-transparent.png"
              width={160}
              height={160}
              alt="Theta Tau crest"
              className="h-auto w-[120px] sm:w-[150px]"
            />
            <div>
              <Link href="/" className="flex items-center">
                <span className={`${bungee.className} text-3xl uppercase tracking-[0.2em] text-[#7a0104]`}>
                  Theta Tau
                </span>
              </Link>
              <p className={`${bungee.className} mt-2 text-base uppercase text-[#1b0f0f]`}>
                Delta Gamma Chapter
              </p>
              <p className={`${bungee.className} mt-2 text-base uppercase text-[#1b0f0f]`}>
                Arizona State University
              </p>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr,0.85fr,0.75fr,0.85fr] lg:gap-6">
            <div>
              <h2 className={`${bungee.className} mb-4 text-sm uppercase tracking-[0.2em] text-[#7a0104]`}>
                Contacts
              </h2>
              <ul className="space-y-3 text-base text-[#1b0f0f] whitespace-nowrap">
                <li>Regent - Roen Wainscoat</li>
                <li>Vice Regent - Kyler Eenhuis</li>
                <li>Rush Chair - Pari Pandey</li>
                <li>
                  <a
                    className="underline underline-offset-4"
                    href="mailto:general@thetatau-dg.org"
                  >
                    Email Us
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className={`${bungee.className} mb-4 text-sm uppercase tracking-[0.2em] text-[#7a0104]`}>
                Links
              </h2>
              <ul className="space-y-3 text-base text-[#1b0f0f]">
                <li>
                  <Link href="/about" className="underline underline-offset-4">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/rush" className="underline underline-offset-4">
                    Rush
                  </Link>
                </li>
                <li>
                  <Link href="/merch" className="underline underline-offset-4">
                    Merch
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h2 className={`${bungee.className} mb-4 text-sm uppercase tracking-[0.2em] text-[#7a0104]`}>
                Members Only
              </h2>
              <div className="text-base text-[#1b0f0f]">
                <SignedOut>
                  <SignInButton
                    signUpForceRedirectUrl="/member/onboard"
                    signUpFallbackRedirectUrl="/member/onboard"
                  />
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            </div>

            <div>
              <h2 className={`${bungee.className} mb-4 text-sm uppercase tracking-[0.2em] text-[#7a0104]`}>
                Pillars
              </h2>
              <ul className="space-y-3 text-base text-[#1b0f0f]">
                <li>
                  <Link
                    href="/about#brotherhood"
                    className="underline underline-offset-4"
                  >
                    Brotherhood
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about#professionalism"
                    className="underline underline-offset-4"
                  >
                    Professionalism
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about#service"
                    className="underline underline-offset-4"
                  >
                    Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 bg-[#4a0b0b] px-4 py-4 text-[#fbf6dc]">
        <div className={`${bungee.className} mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-4 text-xs uppercase tracking-[0.2em] sm:flex-row`}>
          <span>Copyright © 2025 Theta Tau Delta Gamma. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <a href="https://www.instagram.com/thetataudg/" target="_blank">
              Instagram
            </a>
            <a href="mailto:general@thetatau-dg.org">Email</a>
            <a href="https://github.com/roenw/ThetaTau-Website" target="_blank">
              GitHub
            </a>
          </div>
          <Link href="/privacy-policy">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
