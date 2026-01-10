"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { Bungee } from "next/font/google";

import AWS from "/public/company_carousel/amazon-web-services-2.svg";
import Disney from "/public/company_carousel/disney.svg";
import Ford from "/public/company_carousel/ford-1.svg";
import DOD from "/public/company_carousel/us-department-of-defense.svg";
import PS from "/public/company_carousel/playstation-6.svg";
import MKB from "/public/company_carousel/milwaukee-brewers-1.svg";
import NG from "/public/company_carousel/Northrop_Grumman.png";
import LHM from "/public/company_carousel/Lockheed_Martin_logo.png";
import Intel from "/public/company_carousel/intel.svg";
import HW from "/public/company_carousel/honeywell-logo.svg";
import Boeing from "/public/company_carousel/boeing-3.svg";
import Apple from "/public/company_carousel/apple-14.svg";
import AllS from "/public/company_carousel/allstate-logo.svg";
import Accent from "/public/company_carousel/accenture-7.svg";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

export default function About() {
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

  useEffect(() => {
    const marquee = document.querySelector(".logo-marquee");
    const track = marquee?.querySelector(".logo-marquee__track") as HTMLElement | null;
    if (!marquee || !track) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let rafId = 0;
    let lastTime = performance.now();
    let offset = 0;
    let speed = 40;
    const slowSpeed = 18;
    const baseSpeed = 40;

    const update = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      const totalWidth = track.scrollWidth / 2;
      if (totalWidth) {
        offset = (offset + (speed * delta) / 1000) % totalWidth;
        track.style.transform = `translateX(${-offset}px)`;
      }
      rafId = requestAnimationFrame(update);
    };

    const handleEnter = () => {
      speed = slowSpeed;
    };
    const handleLeave = () => {
      speed = baseSpeed;
    };

    marquee.addEventListener("mouseenter", handleEnter);
    marquee.addEventListener("mouseleave", handleLeave);

    rafId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafId);
      marquee.removeEventListener("mouseenter", handleEnter);
      marquee.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[65vh] w-full">
        <Image
          src="/prof_1.JPG"
          fill
          priority
          alt="Theta Tau members in professional attire"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[65vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Delta Gamma Chapter
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            About Theta Tau
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Learn more about the Delta Gamma Chapter at Arizona State University.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr,1fr]">
          <div className="space-y-4">
            <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
              Who We Are
            </h2>
            <p className="text-lg">
              Theta Tau is the nation’s oldest and largest professional engineering
              fraternity. Our Delta Gamma chapter at Arizona State University is a
              close-knit brotherhood built on professional growth, community impact,
              and lifelong friendships.
            </p>
            <p className="text-lg">
              Established in 1995, we are home to active members who support one
              another in academics, leadership development, and service while building
              relationships that last well beyond graduation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Image
              alt="Chapter group photo"
              src="/group_1.jpg"
              width={520}
              height={640}
              className="h-full w-full rounded-[28px] object-cover"
            />
            <div className="flex flex-col gap-4">
              <Image
                alt="Chapter event"
                src="/group_2.jpg"
                width={520}
                height={320}
                className="h-full w-full rounded-[28px] object-cover"
              />
              <Image
                alt="Brotherhood moment"
                src="/group_3.jpg"
                width={520}
                height={320}
                className="h-full w-full rounded-[28px] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#120a0a] px-8 py-12 text-white lg:mx-10 reveal">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Our Pillars
          </p>
          <h2 className={`${bungee.className} mt-3 text-4xl text-[#b3202a]`}>
            Brotherhood, Professionalism, Service
          </h2>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <div className="rounded-[28px] bg-[#1b0f0f] p-6 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
            <Image
              src="/fun.jpg"
              alt="Brotherhood"
              width={520}
              height={320}
              className="h-[190px] w-full rounded-[22px] object-cover"
            />
            <h3 className={`${bungee.className} mt-6 text-2xl text-[#b3202a]`}>
              Brotherhood
            </h3>
            <p className="mt-3 text-base text-white/85">
              Pledge classes, big-little bonds, and family lineages create a support
              system that feels like home throughout college and beyond.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li>• Pledge classes grow and bond together.</li>
              <li>• Big-little mentorships guide every member.</li>
              <li>• Families connect alumni and actives.</li>
            </ul>
          </div>

          <div className="rounded-[28px] bg-[#1b0f0f] p-6 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
            <Image
              src="/ec.JPG"
              alt="Professionalism"
              width={520}
              height={320}
              className="h-[190px] w-full rounded-[22px] object-cover"
            />
            <h3 className={`${bungee.className} mt-6 text-2xl text-[#b3202a]`}>
              Professionalism
            </h3>
            <p className="mt-3 text-base text-white/85">
              We invest in our members with mentorship, networking, and skill-building
              opportunities that prepare brothers for their careers.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li>• Resume reviews and interview prep.</li>
              <li>• Alumni guidance and career connections.</li>
              <li>• Projects that build real-world experience.</li>
            </ul>
          </div>

          <div className="rounded-[28px] bg-[#1b0f0f] p-6 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
            <Image
              src="/service.jpg"
              alt="Service"
              width={520}
              height={320}
              className="h-[190px] w-full rounded-[22px] object-cover"
            />
            <h3 className={`${bungee.className} mt-6 text-2xl text-[#b3202a]`}>
              Service
            </h3>
            <p className="mt-3 text-base text-white/85">
              As engineers, we give back to the community that shapes us through
              philanthropy, outreach, and hands-on service projects.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li>• Community cleanups and STEM outreach.</li>
              <li>• Philanthropy supporting local causes.</li>
              <li>• Campus partnerships and volunteer events.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="text-center">
          <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
            Where We’ve Worked
          </h2>
          <p className="mt-3 text-base text-[#1b0f0f]/80">
            Our brothers bring their skills to leading companies across industries.
          </p>
        </div>
        <div className="mt-8">
          <div className="logo-marquee">
            <div className="logo-marquee__track">
              <div className="logo-marquee__row">
                <AWS className="logo-marquee__logo" />
                <Disney className="logo-marquee__logo" />
                <Ford className="logo-marquee__logo" />
                <DOD className="logo-marquee__logo" />
                <PS className="logo-marquee__logo" />
                <MKB className="logo-marquee__logo" />
                <Image
                  src={NG}
                  alt="Northrop Grumman"
                  width={220}
                  height={64}
                  className="logo-marquee__logo logo-marquee__logo--wide"
                />
                <Image
                  src={LHM}
                  alt="Lockheed Martin"
                  width={220}
                  height={64}
                  className="logo-marquee__logo logo-marquee__logo--wide"
                />
                <Intel className="logo-marquee__logo" />
                <HW className="logo-marquee__logo" />
                <Boeing className="logo-marquee__logo" />
                <Apple className="logo-marquee__logo" />
                <AllS className="logo-marquee__logo" />
                <Accent className="logo-marquee__logo" />
              </div>
              <div className="logo-marquee__row" aria-hidden="true">
                <AWS className="logo-marquee__logo" />
                <Disney className="logo-marquee__logo" />
                <Ford className="logo-marquee__logo" />
                <DOD className="logo-marquee__logo" />
                <PS className="logo-marquee__logo" />
                <MKB className="logo-marquee__logo" />
                <Image
                  src={NG}
                  alt="Northrop Grumman"
                  width={220}
                  height={64}
                  className="logo-marquee__logo logo-marquee__logo--wide"
                />
                <Image
                  src={LHM}
                  alt="Lockheed Martin"
                  width={220}
                  height={64}
                  className="logo-marquee__logo logo-marquee__logo--wide"
                />
                <Intel className="logo-marquee__logo" />
                <HW className="logo-marquee__logo" />
                <Boeing className="logo-marquee__logo" />
                <Apple className="logo-marquee__logo" />
                <AllS className="logo-marquee__logo" />
                <Accent className="logo-marquee__logo" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
