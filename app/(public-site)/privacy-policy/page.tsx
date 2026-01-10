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
    title: "Information We Collect",
    body:
      "We collect information you choose to share with us, such as your name, email address, phone number, and academic details when you fill out interest forms or contact us. We also collect basic usage data from our website such as pages visited, device type, and approximate location.",
  },
  {
    title: "How We Use Information",
    body:
      "We use your information to respond to inquiries, share event updates, process recruitment interest, and improve our site content. We may also use aggregated analytics to understand how visitors interact with the site.",
  },
  {
    title: "Sharing and Disclosure",
    body:
      "We do not sell your personal information. We may share information with chapter officers or advisors who need it to support recruitment or event planning. We may also share information if required by law.",
  },
  {
    title: "Cookies and Analytics",
    body:
      "Our site may use cookies or similar technologies to keep the site running smoothly and to measure site traffic. You can control cookies through your browser settings. Disabling cookies may affect some site functionality.",
  },
  {
    title: "Data Retention",
    body:
      "We keep information only as long as needed for the purposes described in this policy or as required by applicable policies and laws.",
  },
  {
    title: "Security",
    body:
      "We take reasonable measures to protect your information, but no method of transmission or storage is completely secure. Please use caution when sharing sensitive information online.",
  },
  {
    title: "Children's Privacy",
    body:
      "Our site is intended for college-age visitors. We do not knowingly collect information from children under 13. If you believe we have collected such information, contact us so we can remove it.",
  },
  {
    title: "Third-Party Links",
    body:
      "Our site may link to third-party websites such as interest forms or social media. We are not responsible for their content or privacy practices.",
  },
  {
    title: "Policy Updates",
    body:
      "We may update this policy from time to time. Changes will be posted on this page with a new effective date.",
  },
];

export default function PrivacyPolicy() {
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
          src="/group_2.jpg"
          fill
          priority
          alt="Theta Tau brothers together"
          className="object-cover object-[50%_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[55vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Theta Tau Delta Gamma
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Effective date: September 1, 2024. Learn how we collect, use, and
            protect information when you visit our website or submit forms.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <p className="text-sm uppercase tracking-[0.35em] text-[#7a0104]">
          Overview
        </p>
        <h2 className={`${bungee.className} mt-3 text-3xl text-[#b3202a]`}>
          How We Handle Your Information
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-[#1b0f0f]/80">
          This policy explains what we collect, how we use it, and the choices
          you have. We only collect what we need to support recruitment,
          communication, and chapter operations.
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
              <p className="mt-3 text-base text-[#1b0f0f]/80">
                {section.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#120a0a] px-8 py-12 text-white lg:mx-10 reveal">
        <div className="max-w-3xl">
          <h2 className={`${bungee.className} text-3xl text-[#f5d79a]`}>
            Contact
          </h2>
          <p className="mt-4 text-base text-white/80">
            If you have questions about this policy or want to request updates to
            your information, contact us at{" "}
            <a className="underline underline-offset-4" href="mailto:general@thetatau-dg.org">
              general@thetatau-dg.org
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
