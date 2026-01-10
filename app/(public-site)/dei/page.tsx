"use client";

import Image from "next/image";
import React, { useEffect } from "react";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const deiCommitments = [
  {
    title: "Inclusive Membership",
    body:
      "We welcome students from all backgrounds and identities and work to ensure everyone feels respected, supported, and seen.",
  },
  {
    title: "Equitable Opportunities",
    body:
      "Leadership, professional development, and service opportunities are available to every member. We work to remove barriers to participation.",
  },
  {
    title: "Respectful Culture",
    body:
      "We expect members to uphold a culture of dignity and care, inside and outside of Theta Tau events.",
  },
  {
    title: "Accessibility and Support",
    body:
      "We aim to make events and communications accessible and are committed to listening to the needs of our community.",
  },
  {
    title: "Continuous Improvement",
    body:
      "DEI is ongoing work. We seek feedback, learn from our members, and improve our practices year over year.",
  },
  {
    title: "Accountability",
    body:
      "When our values are not upheld, we address concerns promptly and responsibly in line with chapter and university policies.",
  },
];

export default function DEIPage() {
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
          alt="Theta Tau members together"
          className="object-cover object-[50%_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[55vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Theta Tau Delta Gamma
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            DEI Commitment
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            We are pro-DEI. Our chapter is committed to building an inclusive,
            equitable, and supportive community for every member.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <p className="text-sm uppercase tracking-[0.35em] text-[#7a0104]">
          Our Promise
        </p>
        <h2 className={`${bungee.className} mt-3 text-3xl text-[#b3202a]`}>
          Diversity, Equity, and Inclusion
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-[#1b0f0f]/80">
          We believe that a stronger brotherhood is built through diverse
          perspectives, equitable opportunities, and an environment where
          everyone can thrive.
        </p>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-white px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid gap-8 lg:grid-cols-2">
          {deiCommitments.map((item) => (
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
            Questions or Feedback?
          </h2>
          <p className="mt-4 text-base text-white/80">
            We welcome input that helps us grow. Contact us at{" "}
            <a className="underline underline-offset-4" href="mailto:general@thetatau-dg.org">
              general@thetatau-dg.org
            </a>{" "}
            with any questions or suggestions.
          </p>
        </div>
      </section>
    </main>
  );
}
