"use client";

import Image from "next/image";
import { useEffect } from "react";
import { Bungee } from "next/font/google";
import { FaHeart, FaHandshake, FaSeedling, FaWrench } from "react-icons/fa";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

const impactItems = [
  {
    title: "Scholarships",
    copy: "Support academic awards and conference travel.",
    icon: FaSeedling,
  },
  {
    title: "Professional Growth",
    copy: "Power workshops, speakers, and leadership training.",
    icon: FaHandshake,
  },
  {
    title: "Service Projects",
    copy: "Fuel outreach, philanthropy, and community builds.",
    icon: FaHeart,
  },
  {
    title: "Chapter Tools",
    copy: "Keep equipment and event resources stocked.",
    icon: FaWrench,
  },
];

const givingLevels = [
  {
    tier: "Supporter",
    amount: "$50",
    detail: "Helps cover event supplies and meeting resources.",
  },
  {
    tier: "Mentor",
    amount: "$150",
    detail: "Funds a professional workshop or speaker night.",
  },
  {
    tier: "Builder",
    amount: "$300",
    detail: "Supports service projects and chapter initiatives.",
  },
];

export default function DonatePage() {
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
      <section className="relative min-h-[70vh] w-full">
        <Image
          src="/everyone.jpg"
          fill
          priority
          alt="Theta Tau members together"
          className="object-cover object-[50%_40%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/65 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[70vh] flex-col items-start justify-end px-6 pb-12 sm:px-12 reveal">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Give Back
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Donate to Delta Gamma
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Your support fuels scholarships, professional development, and service
            projects for the next generation of engineers.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a href="#donate-form" className="tt-button-primary">
              Make a Donation
            </a>
            <a href="/brothers" className="tt-button-secondary">
              Meet the Chapter
            </a>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid gap-10 lg:grid-cols-[1.2fr,0.8fr]">
          <div>
            <h2 className={`${bungee.className} text-4xl text-[#7a0104]`}>
              Why Your Gift Matters
            </h2>
            <p className="mt-4 text-lg text-[#1b0f0f]/80">
              Theta Tau Delta Gamma builds engineers who lead with integrity. Gifts
              help us expand mentoring, send members to conferences, and serve our
              community. Every donation is an investment in student success.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {impactItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-[20px] bg-white p-5 shadow-[0_10px_22px_rgba(0,0,0,0.12)]"
                  >
                    <Icon className="text-2xl text-[#b3202a]" />
                    <h3 className={`${bungee.className} mt-3 text-xl text-[#7a0104]`}>
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm text-[#1b0f0f]/70">
                      {item.copy}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-[28px] bg-[#120a0a] p-8 text-white shadow-[0_12px_26px_rgba(0,0,0,0.35)]">
            <p className="text-xs uppercase tracking-[0.4em] text-[#f5d79a]">
              Giving Levels
            </p>
            <div className="mt-6 space-y-5">
              {givingLevels.map((tier) => (
                <div
                  key={tier.tier}
                  className="rounded-[20px] border border-white/10 px-4 py-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className={`${bungee.className} text-xl text-[#e2ab16]`}>
                      {tier.tier}
                    </h3>
                    <span className="text-sm uppercase tracking-[0.3em] text-white/60">
                      {tier.amount}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-white/70">{tier.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="donate-form"
        className="mx-auto mt-16 w-full max-w-5xl px-6 reveal"
      >
        <div className="rounded-[32px] bg-[#1b0f0f] p-10 text-white shadow-[0_16px_34px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className={`${bungee.className} text-3xl text-[#b3202a]`}>
                Make a Donation
              </h2>
              <p className="mt-3 text-sm text-white/70">
                This form is a placeholder. We can connect it to Stripe, Venmo,
                or your preferred giving platform.
              </p>
            </div>
            <a href="mailto:thetatau-dg@asu.edu" className="tt-button-secondary">
              Contact Us
            </a>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <label className="text-xs uppercase tracking-[0.3em] text-white/60">
              Amount
              <input
                className="mt-3 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none focus:border-[#e2ab16]"
                placeholder="$150"
                type="text"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.3em] text-white/60">
              Name
              <input
                className="mt-3 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none focus:border-[#e2ab16]"
                placeholder="Your name"
                type="text"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.3em] text-white/60">
              Email
              <input
                className="mt-3 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none focus:border-[#e2ab16]"
                placeholder="name@email.com"
                type="email"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.3em] text-white/60">
              Message
              <input
                className="mt-3 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none focus:border-[#e2ab16]"
                placeholder="Optional dedication"
                type="text"
              />
            </label>
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <button type="button" className="tt-button-primary">
              Submit Gift
            </button>
            <button type="button" className="tt-button-secondary">
              Sponsor an Event
            </button>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-14 rounded-[36px] bg-[#fdf7df] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="rounded-[24px] bg-white p-6 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
            <h3 className={`${bungee.className} text-2xl text-[#7a0104]`}>
              Alumni & Friends
            </h3>
            <p className="mt-3 text-sm text-[#1b0f0f]/70">
              Help us keep Delta Gamma strong for future classes of engineers.
            </p>
          </div>
          <div className="rounded-[24px] bg-white p-6 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
            <h3 className={`${bungee.className} text-2xl text-[#7a0104]`}>
              Corporate Partners
            </h3>
            <p className="mt-3 text-sm text-[#1b0f0f]/70">
              Sponsor a workshop, project team, or professional speaker series.
            </p>
          </div>
          <div className="rounded-[24px] bg-white p-6 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
            <h3 className={`${bungee.className} text-2xl text-[#7a0104]`}>
              Service Allies
            </h3>
            <p className="mt-3 text-sm text-[#1b0f0f]/70">
              Partner with us on service initiatives across the ASU community.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
