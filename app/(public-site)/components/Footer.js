import Link from "next/link";
import Image from "next/image";
import { FaEnvelope, FaGithub, FaInstagram } from "react-icons/fa";
import { bungee } from "../../fonts";
import ReportProblemLink from "./ReportProblemLink";

const socialLinks = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/thetataudg/",
    icon: FaInstagram,
  },
  {
    label: "Email",
    href: "mailto:general@ttdg.org",
    icon: FaEnvelope,
  },
  {
    label: "GitHub",
    href: "https://github.com/roenw/ThetaTau-Website",
    icon: FaGithub,
  },
];

const chapterLinks = [
  { label: "About", href: "/about" },
  { label: "Rush", href: "/rush" },
  { label: "Brothers", href: "/brothers" },
  { label: "Alumni", href: "/alumni" },
];

const moreLinks = [
  { label: "Donate", href: "/donate" },
  { label: "Privacy", href: "/privacy-policy" },
  { label: "Terms", href: "/terms" },
];

const footerLinkClass =
  "text-sm text-[#f8ead4]/70 transition-colors hover:text-[#f8ead4]";
const headingClass =
  "mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#f8ead4]/50";

const Footer = () => {
  return (
    <footer className="bg-[#120a0a] pt-20 text-[#f8ead4]">
      <div className="w-full overflow-hidden border-t border-[#fbf6dc]/10 bg-[linear-gradient(170deg,#1b0f0f_8%,#120a0a_62%,#0f0808_100%)]">
        <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10 sm:px-6">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="max-w-xs">
              <Link href="/" className="flex items-center gap-3">
                <Image
                  src="/crest-transparent.png"
                  width={32}
                  height={32}
                  alt="Theta Tau crest"
                  className="h-8 w-8"
                />
                <span className={`${bungee.className} text-[13px] uppercase tracking-[0.12em] text-[#cf3640]`}>
                  Theta Tau
                </span>
              </Link>
              <p className="mt-3 text-sm text-[#f8ead4]/60">
                Delta Gamma Chapter at Arizona State University
              </p>
              <div className="mt-5 flex items-center gap-2">
                {socialLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                      aria-label={item.label}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#fbf6dc]/10 text-[#f8ead4]/80 transition-colors hover:border-[#e2ab16]/60 hover:text-[#f5d79a]"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:gap-x-20">
              <div>
                <h3 className={headingClass}>Chapter</h3>
                <ul className="space-y-2.5">
                  {chapterLinks.map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className={footerLinkClass}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className={headingClass}>More</h3>
                <ul className="space-y-2.5">
                  {moreLinks.map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className={footerLinkClass}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <ReportProblemLink className={footerLinkClass} />
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <p className="mt-10 text-xs text-[#f8ead4]/45">
            Copyright © 2026 Theta Tau Delta Gamma. All rights reserved.
          </p>
        </div>

        <div className="border-t border-white/10">
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
