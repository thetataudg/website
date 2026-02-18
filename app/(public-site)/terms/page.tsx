"use client";

import Image from "next/image";
import React, { useEffect } from "react";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const sections = [
  {
    title: "Acceptance of Terms",
    body:
      "By accessing the Theta Tau Delta Gamma website, you agree to this Terms of Service. If you access member-only tools (dashboard, Discord linking, event signups) you must also follow the related member policies and any instructions shared by chapter leadership.",
  },
  {
    title: "Website Usage",
    body:
      "The site is provided for informational and recruitment purposes. You may not use it to harass others, post spam, or reverse-engineer any protected part of the experience. We reserve the right to suspend access for anyone violating these terms.",
  },
  {
    title: "Discord Linking & Authentication",
    body:
      "We offer a Discord linking experience so that approved members can connect their chapter account to Theta Tau Delta Gamma’s Discord server. That flow uses secure OAuth calls handled by our bot tokens, Clerk session data, and the Discord API. You must keep your account credentials private; lost or compromised credentials should be reported immediately.",
  },
  {
    title: "User Data & Profiles",
    body:
      "We store the basic profile details you provide during onboarding (name, roll number, major, photos, and any social links). Pending profiles and approved members can also store a Discord User ID to keep server access in sync. We use these fields to manage internal communications and to determine access to member-only resources.",
  },
  {
    title: "Content Ownership",
    body:
      "Original materials on this site (text, photography, design) are owned by Theta Tau Delta Gamma. Users own the person-specific content they upload, but by submitting it you grant us a license to display and share it within the chapter community.",
  },
  {
    title: "Third-Party Services",
    body:
      "We integrate services like Clerk for authentication, Discord for server membership, and various analytics/cookie solutions to keep the site running. Those services are subject to their own terms, so please review them before linking your accounts.",
  },
  {
    title: "Security & Liability",
    body:
      "We use SSL, rate limiting, and other reasonable safeguards, but no system is infallible. The site is provided “as is,” and we are not liable for indirect or consequential damages arising from your use.",
  },
  {
    title: "Modifications & Termination",
    body:
      "Theta Tau Delta Gamma may update or remove content, suspend features, or end the site at any time. We will post the latest version of these Terms on this page with an effective date at the top.",
  },
];

export default function TermsOfService() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".reveal"));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[55vh] w-full">
        <Image
          src="/group_1.jpg"
          fill
          priority
          alt="Theta Tau brothers standing on campus"
          className="object-cover object-[50%_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[55vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Theta Tau Delta Gamma
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Terms of Service
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Effective date: January 1, 2026. These terms describe how you may
            engage with the public site, member tools, and Discord-linked services.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <p className="text-sm uppercase tracking-[0.35em] text-[#7a0104]">
          Overview
        </p>
        <h2 className={`${bungee.className} mt-3 text-3xl text-[#b3202a]`}>
          Your Responsibilities & Our Commitments
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-[#1b0f0f]/80">
          This page governs how you interact with thetatau-dg.org and the services
          we provide, including automated data sync to Discord, Clerk-authenticated
          dashboards, and recruitment forms. Following these terms helps keep the
          chapter community secure and accessible.
        </p>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-white px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid gap-8 lg:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-[24px] bg-[#fbf6dc] p-6 shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
            >
              <h2 className={`${bungee.className} text-2xl text-[#7a0104]`}>
                {section.title}
              </h2>
              <p className="mt-3 text-base text-[#1b0f0f]/80">{section.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#120a0a] px-8 py-12 text-white lg:mx-10 reveal">
        <div className="max-w-3xl">
          <h2 className={`${bungee.className} text-3xl text-[#f5d79a]`}>Contact</h2>
          <p className="mt-4 text-base text-white/80">
            Questions about these terms? Reach out to{" "}
            <a
              className="underline underline-offset-4"
              href="mailto:general@thetatau-dg.org"
            >
              general@thetatau-dg.org
            </a>
            . You can also contact any executive council officer through the
            main chapter website.
          </p>
        </div>
      </section>
    </main>
  );
}
