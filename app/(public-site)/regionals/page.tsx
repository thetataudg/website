"use client";

import Image from "next/image";
import React, { useEffect } from "react";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const regionalsHighlights = [
  { label: "Date", value: "November 9, 2024" },
  { label: "Host", value: "Delta Gamma Chapter" },
  { label: "Location", value: "Arizona State University" },
  { label: "Focus", value: "Connection, skills, and service" },
];

export default function Regionals() {
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
      <section className="relative min-h-[60vh] w-full">
        <Image
          src="/group_3.jpg"
          fill
          priority
          alt="Theta Tau regionals gathering"
          className="object-cover object-[50%_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[60vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Regional Conference
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Regionals
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Fall 2024 Southwestern Regional Conference hosted by the Delta Gamma
            Chapter at Arizona State University.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="flex flex-col justify-center">
            <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
              Southwestern Regional Conference
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[#1b0f0f]/90">
              <strong className="font-semibold">Brothers of the Theta Tau Southwestern Region,</strong>
              <br />
              <br />
              Are you ready to connect and collaborate at the Fall 2024
              Southwestern Regional Conference at Arizona State University? The
              Delta Gamma chapter is thrilled to host a day of growth,
              connection, and fun.
              <br />
              <br />
              Our mission is to unite chapters across the southwest region by
              offering a unique opportunity to meet new brothers, cultivate
              valuable skills, and give back to our community. The day will kick
              off with engaging activities followed by hands-on breakout
              sessions and finish with an impactful act of service.
              <br />
              <br />
              We can’t wait to see you on November 9th.
            </p>
            <p className="mt-4 text-base text-[#1b0f0f]/70">
              <em>
                We thank our organizing team and all contributors for making
                this engaging event possible.
              </em>
            </p>
          </div>
          <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
            <p className="text-sm uppercase tracking-[0.25em] text-[#7a0104]">
              Event Snapshot
            </p>
            <h3 className={`${bungee.className} mt-3 text-2xl text-[#b3202a]`}>
              Regionals Details
            </h3>
            <div className="mt-6 space-y-4">
              {regionalsHighlights.map((item) => (
                <div key={item.label}>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#7a0104]/70">
                    {item.label}
                  </p>
                  <p className="text-lg font-semibold text-[#1b0f0f]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-white px-6 py-10 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr,1fr]">
          <div className="rounded-[28px] bg-[#fbf6dc] p-8 shadow-[0_16px_36px_rgba(0,0,0,0.12)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#7a0104]">
              Schedule
            </p>
            <h2 className={`${bungee.className} mt-3 text-3xl text-[#1b0f0f]`}>
              Regional Conference Agenda
            </h2>
            <p className="mt-4 text-base text-[#1b0f0f]/80">
              Review the full day schedule so your chapter can plan arrival,
              sessions, and service work with ease.
            </p>
          </div>
          <div className="overflow-hidden rounded-[28px] bg-[#120a0a] p-4">
            <Image
              alt="Regionals schedule"
              src="/RegionalsSchedule.png"
              width={640}
              height={820}
              className="h-full w-full rounded-[22px] object-cover"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
