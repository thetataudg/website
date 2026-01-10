"use client";

import Image from "next/image";
import { Bungee } from "next/font/google";
import { useEffect } from "react";

import { FaUsers, FaGraduationCap, FaBuilding } from "react-icons/fa"

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bungee",
  weight: "400"
});

export default function Home() {
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
      <section className="bg-[#120a0a] py-20 reveal">
        <h2 className={`${bungee.className} text-center text-5xl text-[#b3202a]`}>
          Who We Are
        </h2>

        <div className="mx-auto mt-12 grid w-full max-w-7xl grid-cols-1 gap-12 px-6 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-4 text-base uppercase tracking-[0.35em] text-white/80">
              <span className="h-[2px] w-20 bg-white/80" />
              <span>Since 1904</span>
            </div>
            <h3 className={`${bungee.className} mt-6 text-5xl text-[#b3202a]`}>
              We Are Theta Tau
            </h3>
            <p className="mt-5 text-lg text-white/85">
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
              className="h-auto w-[90%] max-w-[620px]"
              src="/Polaroids.png"
              width="583"
              height="454"
              alt="Polaroid photos of Theta Tau members"
            />
          </div>
        </div>
      </section>

      {/* Our Values Section */}
      <section className="mx-4 rounded-[36px] bg-[#fdf7df] py-24 text-center lg:mx-10 reveal">
        <h2 className={`${bungee.className} text-5xl text-[#b3202a]`}>
          Our Values
        </h2>

        <div className="mx-auto mt-14 flex w-full max-w-7xl flex-col gap-12 px-6">
          <div className="rounded-[32px] bg-[#120a0a] px-10 py-16 shadow-[0_12px_32px_rgba(0,0,0,0.35)] sm:px-14 reveal">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="order-2 lg:order-1">
                <h3 className={`${bungee.className} text-4xl text-[#b3202a]`}>
                  Brotherhood
                </h3>
                <p className="mt-5 text-xl text-white/85">
                  Theta Tau fosters a strong sense of brotherhood by uniting members
                  through shared values, collaborative efforts, and lifelong friendships.
                </p>
                <a
                  href="/pillars#brotherhood"
                  className="tt-button-secondary mt-10 inline-flex"
                >
                  Meet Our Brothers
                </a>
              </div>
              <div className="order-1 flex justify-center lg:order-2">
                <Image
                  alt="Brotherhood"
                  src="/Homepage-Brotherhood.png"
                  width="449"
                  height="334"
                  className="rounded-[44px] w-[95%] max-w-[620px]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[32px] bg-[#120a0a] px-10 py-16 shadow-[0_12px_32px_rgba(0,0,0,0.35)] sm:px-14 reveal">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="flex justify-center">
                <Image
                  alt="Service"
                  src="/Homepage-Service.png"
                  width="449"
                  height="334"
                  className="rounded-[44px] w-[95%] max-w-[620px]"
                />
              </div>
              <div>
                <h3 className={`${bungee.className} text-4xl text-[#b3202a]`}>
                  Service
                </h3>
                <p className="mt-5 text-xl text-white/85">
                  Members dedicate time and skills to community outreach and philanthropy,
                  creating meaningful change around campus and beyond.
                </p>
                <a
                  href="/pillars#service"
                  className="tt-button-secondary mt-10 inline-flex"
                >
                  Learn More
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] bg-[#120a0a] px-10 py-16 shadow-[0_12px_32px_rgba(0,0,0,0.35)] sm:px-14 reveal">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="order-2 lg:order-1">
                <h3 className={`${bungee.className} text-4xl text-[#b3202a]`}>
                  Professionalism
                </h3>
                <p className="mt-5 text-xl text-white/85">
                  We cultivate communication, problem-solving, and leadership skills so
                  engineers thrive professionally and serve their communities.
                </p>
                <a
                  href="/pillars#professionalism"
                  className="tt-button-secondary mt-10 inline-flex"
                >
                  Learn More
                </a>
              </div>
              <div className="order-1 flex justify-center lg:order-2">
                <Image
                  alt="Professionalism"
                  src="/Homepage-Professional.png"
                  width="449"
                  height="334"
                  className="rounded-[44px] w-[95%] max-w-[620px]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-14 w-full max-w-5xl rounded-[28px] bg-[#120a0a] px-8 py-12 reveal">
          <div className="grid grid-cols-1 gap-10 text-center sm:grid-cols-3">
            <div>
              <FaUsers className="mx-auto" color="#e2ab16" size={72} />
              <h3 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
                70+
              </h3>
              <p className="text-sm uppercase tracking-[0.25em] text-white/80">
                Actives
              </p>
            </div>
            <div>
              <FaGraduationCap className="mx-auto" color="#e2ab16" size={72} />
              <h3 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
                200+
              </h3>
              <p className="text-sm uppercase tracking-[0.25em] text-white/80">
                Alumni
              </p>
            </div>
            <div>
              <FaBuilding className="mx-auto" color="#e2ab16" size={72} />
              <h3 className={`${bungee.className} mt-4 text-4xl text-[#b3202a]`}>
                90+
              </h3>
              <p className="text-sm uppercase tracking-[0.25em] text-white/80">
                Chapters
              </p>
            </div>
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
