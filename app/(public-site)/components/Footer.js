"use client";

import { Bungee } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import { FaEnvelope, FaGithub, FaInstagram } from "react-icons/fa";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const socialLinks = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/thetataudg/",
    icon: FaInstagram,
  },
  {
    label: "Email",
    href: "mailto:general@thetatau-dg.org",
    icon: FaEnvelope,
  },
  {
    label: "GitHub",
    href: "https://github.com/roenw/ThetaTau-Website",
    icon: FaGithub,
  },
];

const legalLinks = [
  { label: "Privacy", href: "/privacy-policy" },
  { label: "Terms", href: "/terms" },
];

const Footer = () => {
  return (
    <footer className="bg-[#120a0a] px-0 pb-0 pt-20 text-[#f8ead4] sm:px-3">
      <div className="w-full overflow-hidden border-y border-[#f5d79a]/30 bg-[linear-gradient(170deg,#1b0f0f_8%,#120a0a_62%,#0f0808_100%)]">
        <div className="mx-auto w-full max-w-[1400px] px-6 pb-2 pt-8 sm:px-10 sm:pt-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <Link href="/" className="flex items-center gap-4">
            <Image
              src="/crest-transparent.png"
              width={56}
              height={56}
              alt="Theta Tau crest"
              className="h-12 w-12"
            />
            <div>
              <p className={`${bungee.className} text-lg uppercase tracking-[0.2em] text-[#cf3640]`}>
                Theta Tau
              </p>
              <p className="text-sm text-[#f8ead4]/80">Delta Gamma Chapter</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[#f8ead4]/58">
                Copyright © 2026 Theta Tau Delta Gamma. All rights reserved.
              </p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              {socialLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                    aria-label={item.label}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#f5d79a]/35 bg-[#120a0a]/65 text-[#f8ead4] transition hover:-translate-y-[1px] hover:border-[#f5d79a] hover:bg-[#1f1111]"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {legalLinks.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#f8ead4]/92 transition hover:border-[#f5d79a]/70 hover:text-[#f5d79a]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        </div>

        <div className="mt-6 border-t border-white/10">
          <div className="overflow-hidden px-1 sm:px-2">
            <div
              aria-hidden="true"
              className={`${bungee.className} footer-aurora-text pointer-events-none -mb-[0.08em] whitespace-nowrap text-center text-[clamp(5.5rem,15.6vw,15rem)] leading-[0.82] tracking-[0.02em]`}
            >
              THETA TAU
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
