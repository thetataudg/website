"use client";

import Image from "next/image";
import React, { useEffect } from "react";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const antiHazingPrinciples = [
  {
    title: "Zero Tolerance",
    body:
      "Theta Tau is an anti-hazing fraternity. Hazing has no place in our chapter or our community.",
  },
  {
    title: "What Hazing Is",
    body:
      "Hazing includes any activity that demeans, endangers, or coerces a member or new member, regardless of intent.",
  },
  {
    title: "What to Expect",
    body:
      "Our new member experience focuses on mentorship, leadership, and brotherhood without humiliation or harm.",
  },
  {
    title: "Reporting Matters",
    body:
      "We encourage anyone with concerns to report them. Speaking up helps protect people and uphold our values.",
  },
  {
    title: "Support and Care",
    body:
      "We prioritize safety and well-being in all chapter events, training, and membership activities.",
  },
  {
    title: "Accountability",
    body:
      "Violations are taken seriously and addressed according to chapter, national, and university policies.",
  },
];

export default function AntiHazingPage() {
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
          src="/rush_4.jpg"
          fill
          priority
          alt="Theta Tau members at a rush event"
          className="object-cover object-[50%_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[55vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Theta Tau Delta Gamma
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Anti-Hazing
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            We are committed to a safe, respectful, and welcoming experience for
            all members and new members.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <p className="text-sm uppercase tracking-[0.35em] text-[#7a0104]">
          Our Policy
        </p>
        <h2 className={`${bungee.className} mt-3 text-3xl text-[#b3202a]`}>
          A Clear Commitment
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-[#1b0f0f]/80">
          Theta Tau Delta Gamma prohibits hazing in any form. Our chapter
          culture is built on mentorship, professionalism, and mutual respect.
        </p>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-white px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid gap-8 lg:grid-cols-2">
          {antiHazingPrinciples.map((item) => (
            <div
              key={item.title}
              className="rounded-[24px] bg-[#fbf6dc] p-6 shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
            >
              <h3 className={`${bungee.className} text-2xl text-[#7a0104]`}>
                {item.title}
              </h3>
              <p className="mt-3 text-base text-[#1b0f0f]/80">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#120a0a] px-8 py-12 text-white lg:mx-10 reveal">
        <div className="max-w-3xl">
          <h2 className={`${bungee.className} text-3xl text-[#f5d79a]`}>
            Report a Concern
          </h2>
          <p className="mt-4 text-base text-white/80">
            If you have a concern about hazing or safety, contact us at{" "}
            <a className="underline underline-offset-4" href="mailto:general@thetatau-dg.org">
              general@thetatau-dg.org
            </a>
            . We take every report seriously.
          </p>
        </div>
      </section>
    </main>
  );
}
