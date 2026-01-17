"use client";

import Image from "next/image";
import { Bungee } from "next/font/google";
import { useEffect, useRef, useState } from "react";

import { FaUsers, FaGraduationCap, FaBuilding } from "react-icons/fa"

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bungee",
  weight: "400"
});

export default function Home() {
  const [stats, setStats] = useState({ actives: 0, alumni: 0, chapters: 0 });
  const statsStartedRef = useRef(false);
  const statsRafRef = useRef<number | null>(null);

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
    const statsSection = document.querySelector(".stats-counter");
    if (!statsSection) return;

    const targets = { actives: 60, alumni: 400, chapters: 90 };
    const durationMs = 2000;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || statsStartedRef.current) return;
          statsStartedRef.current = true;

          const start = performance.now();
          const step = (now: number) => {
            const progress = Math.min((now - start) / durationMs, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setStats({
              actives: Math.round(targets.actives * eased),
              alumni: Math.round(targets.alumni * eased),
              chapters: Math.round(targets.chapters * eased),
            });

            if (progress < 1) {
              statsRafRef.current = requestAnimationFrame(step);
            }
          };

          statsRafRef.current = requestAnimationFrame(step);
          observer.disconnect();
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(statsSection);

    return () => {
      observer.disconnect();
      if (statsRafRef.current !== null) {
        cancelAnimationFrame(statsRafRef.current);
      }
    };
  }, []);
  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[85vh] w-full">
        <Image
          src="/TauGamma-Gradient.jpg"
          fill
          priority
          alt="ASU Theta Tau members standing in professional dress"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[85vh] flex-col items-center justify-center px-6 text-center reveal">
          <p className="mb-3 text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Theta Tau - Delta Gamma
          </p>
          <h1 className={`${bungee.className} text-4xl sm:text-6xl lg:text-7xl text-[#b3202a]`}>
            Forging Future Engineers
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/90">
            A professional co-ed engineering fraternity.
          </p>
          <a
            href="/rush"
            className="tt-button-primary mt-8"
          >
            Join Theta Tau
          </a>
        </div>
      </section>

      {/* Who We Are Section */}
      <section className="bg-[#120a0a] py-28 reveal">
        <h2 className={`${bungee.className} text-center text-6xl text-[#b3202a]`}>
          Who We Are
        </h2>

        <div className="mx-auto mt-14 grid w-full max-w-[1320px] grid-cols-1 gap-14 px-6 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-4 text-lg uppercase tracking-[0.45em] text-white/80">
              <span className="h-[8px] w-24 bg-white/80" />
              <span>Since 1904</span>
            </div>
            <h3 className={`${bungee.className} mt-6 text-6xl text-[#b3202a]`}>
              We Are Theta Tau
            </h3>
            <p className="mt-5 text-xl text-white/85">
              Theta Tau is a co-ed professional engineering fraternity at Arizona
              State University. We are a close-knit brotherhood that pushes our
              members to excel professionally and give back to the community.
            </p>
            <div className="mt-10 flex flex-col gap-5 sm:flex-row">
              <a href="/about" className="tt-button-secondary text-center">
                Learn More
              </a>
              <a href="/rush" className="tt-button-primary text-center">
                Join Theta Tau
              </a>
            </div>
          </div>
          <div className="flex items-center justify-center reveal">
            <Image
              className="h-auto w-full max-w-[720px]"
              src="/Polaroids.png"
              width="583"
              height="454"
              alt="Polaroid photos of Theta Tau members"
            />
          </div>
        </div>
      </section>

      <section className="mx-4 rounded-[36px] bg-[#fdf7df] py-24 lg:mx-10 reveal">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
          <p className="text-xs uppercase tracking-[0.5em] text-[#7a0104]">
            The Pillars
          </p>
          <h2 className={`${bungee.className} mt-4 text-5xl text-[#b3202a]`}>
            What We Stand For
          </h2>
        </div>
        <div className="mx-auto mt-12 grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-3">
          <div className="flex h-full min-h-[520px] flex-col rounded-[32px] bg-[#120a0a] p-10 text-white shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
            <div className="flex flex-1 flex-col">
              <div className="overflow-hidden bg-black/30 [border-radius:28%_72%_58%_42%/38%_48%_52%_62%]">
                <Image
                  alt="Brotherhood"
                  src="/brothers_1.JPG"
                  width="449"
                  height="334"
                  className="h-[220px] w-full object-cover [border-radius:28%_72%_58%_42%/38%_48%_52%_62%]"
                />
              </div>
              <h3 className={`${bungee.className} mt-6 text-2xl tracking-[0.02em] text-[#b3202a] sm:text-3xl`}>
                Brotherhood
              </h3>
              <p className="mt-4 text-base text-white/80">
                A family of engineers who push each other to grow, lead, and show up.
              </p>
            </div>
            <a
              href="/brothers"
              className="tt-button-secondary mt-8 inline-flex w-full justify-center text-center"
            >
              Meet the brothers
            </a>
          </div>
          <div className="flex h-full min-h-[520px] flex-col rounded-[32px] bg-[#120a0a] p-10 text-white shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
            <div className="flex flex-1 flex-col">
              <div className="overflow-hidden bg-black/30 [border-radius:62%_38%_36%_64%/48%_62%_38%_52%]">
                <Image
                  alt="Professionalism"
                  src="/delta-gamma-people-professional.jpg"
                  width="449"
                  height="334"
                  className="h-[220px] w-full object-cover object-top [border-radius:62%_38%_36%_64%/48%_62%_38%_52%]"
                />
              </div>
              <h3 className={`${bungee.className} mt-6 text-2xl tracking-[0.02em] text-[#b3202a] sm:text-3xl`}>
                Professionalism
              </h3>
              <p className="mt-4 text-base text-white/80">
                Mentorship, career prep, and leadership training for engineers who want more.
              </p>
            </div>
            <a
              href="/about#professionalism"
              className="tt-button-secondary mt-8 inline-flex w-full justify-center text-center"
            >
              Learn more
            </a>
          </div>
          <div className="flex h-full min-h-[520px] flex-col rounded-[32px] bg-[#120a0a] p-10 text-white shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
            <div className="flex flex-1 flex-col">
              <div className="overflow-hidden bg-black/30 [border-radius:42%_58%_30%_70%/62%_40%_60%_38%]">
                <Image
                  alt="Service"
                  src="/service_2.jpg"
                  width="449"
                  height="334"
                  className="h-[220px] w-full object-cover [border-radius:42%_58%_30%_70%/62%_40%_60%_38%]"
                />
              </div>
              <h3 className={`${bungee.className} mt-6 text-2xl tracking-[0.02em] text-[#b3202a] sm:text-3xl`}>
                Service
              </h3>
              <p className="mt-4 text-base text-white/80">
                We build with purpose through outreach, philanthropy, and impact.
              </p>
            </div>
            <a
              href="/about#service"
              className="tt-button-secondary mt-8 inline-flex w-full justify-center text-center"
            >
              Get involved
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-16 w-full max-w-5xl rounded-[28px] bg-[#120a0a] px-8 py-12 reveal stats-counter">
        <div className="grid grid-cols-1 gap-10 text-center sm:grid-cols-3">
          <div>
            <FaUsers className="mx-auto" color="#e2ab16" size={72} />
            <h3 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
              {stats.actives}+
            </h3>
            <p className="text-sm uppercase tracking-[0.25em] text-white/80">
              Actives
            </p>
          </div>
          <div>
            <FaGraduationCap className="mx-auto" color="#e2ab16" size={72} />
            <h3 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
              {stats.alumni}+
            </h3>
            <p className="text-sm uppercase tracking-[0.25em] text-white/80">
              Alumni
            </p>
          </div>
          <div>
            <FaBuilding className="mx-auto" color="#e2ab16" size={72} />
            <h3 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
              {stats.chapters}+
            </h3>
            <p className="text-sm uppercase tracking-[0.25em] text-white/80">
              Chapters
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-16 w-full max-w-6xl px-6 reveal">
        <div className="grid gap-8 lg:grid-cols-[0.6fr,1.4fr]">
          <div className="rounded-[28px] bg-[#120a0a] p-8 text-white shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
            <p className="text-xs uppercase tracking-[0.5em] text-[#f5d79a]">
              The Experience
            </p>
            <h2 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
              Your journey here
            </h2>
            <p className="mt-4 text-base text-white/75">
              From your first rush event to graduation, Delta Gamma stays by your
              side with opportunities to learn, lead, and build a network for life.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                title: "Rush & Connect",
                copy: "Meet the chapter through socials, info sessions, and service nights.",
              },
              {
                title: "Build Skills",
                copy: "Resume reviews, industry talks, and interview prep with alumni.",
              },
              {
                title: "Lead Together",
                copy: "Run committees, plan events, and guide the chapter forward.",
              },
              {
                title: "Lifelong Network",
                copy: "Stay connected to brothers across the country and industry.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[24px] border border-white/10 bg-[#1b0f0f] px-6 py-8 text-white shadow-[0_12px_24px_rgba(0,0,0,0.35)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_30px_rgba(0,0,0,0.45)]"
              >
                <h3 className={`${bungee.className} text-2xl text-[#f5d79a]`}>
                  {item.title}
                </h3>
                <p className="mt-3 text-sm text-white/70">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-4 mt-14 overflow-hidden rounded-[36px] bg-[#fdf7df] px-6 py-14 text-[#120a0a] lg:mx-10 reveal">
        <Image
          src="/gear_corner.png"
          alt=""
          width={801}
          height={799}
          className="pointer-events-none absolute -left-20 -bottom-28 w-[320px] opacity-80 sm:w-[420px] lg:w-[520px]"
        />
        <Image
          src="/gear_small.png"
          alt=""
          width={401}
          height={343}
          className="pointer-events-none absolute right-6 top-0 w-[140px] opacity-80 sm:w-[180px] lg:w-[220px]"
        />
        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center text-center">
          <h2 className={`${bungee.className} text-4xl text-[#b3202a]`}>
            Ready to Join?
          </h2>
          <p className="mt-4 text-lg text-[#3b1f1f]">
            Ready to join Theta Tau? Become part of a dynamic brotherhood that fosters
            professional growth, champions community service, and builds lifelong friendships,
            all while empowering you to excel both personally and professionally.
          </p>
          <a href="/rush" className="tt-button-primary mt-8">
            Join Theta Tau
          </a>
        </div>
      </section>
    </main>
  );
}
