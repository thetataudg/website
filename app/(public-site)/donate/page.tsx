"use client";

import Image from "next/image";
import { useEffect } from "react";

import { bungee } from "../../fonts";
import DonateForm from "./DonateForm";

/// What the chapter actually spends money on, in the chapter's own words. This
/// list is the page's spine: it matches the funds a donor can choose in the
/// form one for one, so nobody is offered a designation the page never
/// explained, or told about a cause they cannot then give to.
const uses = [
  {
    title: "Housing",
    copy: "Keeping the chapter house running, and keeping it somewhere members want to be.",
  },
  {
    title: "Chapter operations",
    copy: "Meetings, events, and the ordinary running costs that dues do not always cover.",
  },
  {
    title: "Professional certifications",
    copy: "FE exam fees, certifications, and training members carry into their careers.",
  },
  {
    title: "Tools and equipment",
    copy: "Materials and shop tools for the project teams that actually build things.",
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
    <main className="bg-[#120a0a] pb-24 text-white">
      <section className="relative min-h-[56vh] w-full">
        <Image
          src="/everyone.jpg"
          fill
          priority
          alt="Theta Tau members together"
          className="object-cover object-[50%_40%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.46)_40%,rgba(18,10,10,0.93)_72%,#120a0a_100%)]" />
        <div className="reveal relative z-10 mx-auto flex min-h-[56vh] w-full max-w-4xl flex-col items-start justify-end px-6 pb-14">
          <h1
            className={`${bungee.className} text-[28px] leading-[1.08] text-[#b3202a] sm:text-4xl lg:text-5xl`}
          >
            Support Delta Gamma
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/80">
            Gifts from alumni and friends go straight to the chapter: the house,
            the certifications members earn, and the tools they build with.
          </p>
          <a
            href="#give"
            className="tt-button-primary tt-button-plain mt-7 inline-block"
          >
            Give now
          </a>
        </div>
      </section>

      <section className="reveal mx-auto mt-20 w-full max-w-4xl px-6">
        <h2 className={`${bungee.className} text-2xl text-[#e2ab16]`}>
          Where your gift goes
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
          You can point a gift at any of these, or leave it unrestricted and let
          the chapter put it where the gap is.
        </p>

        <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {uses.map((use) => (
            <li
              key={use.title}
              className="grid gap-1 py-5 sm:grid-cols-[15rem,1fr] sm:gap-8"
            >
              <h3 className="text-base font-medium leading-snug text-[#e2ab16]">
                {use.title}
              </h3>
              <p className="text-[15px] leading-relaxed text-white/65">{use.copy}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="give"
        className="reveal mx-auto mt-20 w-full max-w-4xl scroll-mt-28 px-6"
      >
        <DonateForm />
      </section>

      <section className="reveal mx-auto mt-16 w-full max-w-4xl px-6">
        <p className="text-sm leading-relaxed text-white/45">
          Giving as a company, or want to fund something specific like a
          workshop or a project team?{" "}
          <a
            href="mailto:thetatau-dg@asu.edu"
            className="text-[#e2ab16] underline underline-offset-4 hover:text-[#f0c34a]"
          >
            Email the chapter
          </a>{" "}
          and we will find the right way to do it.
        </p>
      </section>
    </main>
  );
}
