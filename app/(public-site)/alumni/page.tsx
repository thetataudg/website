import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  FaCalendarCheck,
  FaEnvelope,
  FaFileAlt,
  FaNewspaper,
  FaSitemap,
  FaUsers,
} from "react-icons/fa";
import { pageMetadata } from "@/lib/seo";
import HomeRevealEffects from "../components/HomeRevealEffects";
import { bungee } from "../../fonts";

// Carries through sign-up to /member/onboard, where it pre-checks "I'm an
// alum" so the request reaches the approving officer already tagged Alumni.
const ALUMNI_SIGN_UP = "/sign-up?from=alumni";

export const metadata: Metadata = pageMetadata({
  title: "Alumni",
  description:
    "Delta Gamma alumni can get a website account to see chapter events and receive meeting minutes and newsletters by email.",
  path: "/alumni",
  hasChildRoutes: true,
});

const uses = [
  {
    title: "Events",
    copy: "See what the chapter has coming up and RSVP to the ones open to alumni.",
    icon: FaCalendarCheck,
  },
  {
    title: "Meeting minutes",
    copy: "A summary of every chapter meeting, sent to your inbox and filed on the site.",
    icon: FaFileAlt,
  },
  {
    title: "Newsletters",
    copy: "Every issue the chapter puts out, delivered by email.",
    icon: FaNewspaper,
  },
  {
    title: "Brother directory",
    copy: "Find the brothers you pledged with and the ones who came after you.",
    icon: FaUsers,
  },
  {
    title: "Family tree",
    copy: "Your bigs, your littles, and the whole line since the chapter started.",
    icon: FaSitemap,
  },
  {
    title: "Chapter email",
    copy: "Request a ttdg.org address to keep using as an alum.",
    icon: FaEnvelope,
  },
];

const steps = [
  {
    title: "Create an account",
    copy: "Sign up with your name, email, and a password, or continue with Google or Apple.",
  },
  {
    title: "Fill out your profile",
    copy: "Your roll number, graduation year, and pledge class are how officers confirm you're a brother. Check the box that says you're an alum.",
  },
  {
    title: "Wait for approval",
    copy: "An officer reviews your request, usually within a few days.",
  },
  {
    title: "Check your email",
    copy: "Once you're approved we email you. Sign in and you're caught up.",
  },
];

export default function AlumniPage() {
  return (
    <main className="overflow-x-hidden bg-[#120a0a] text-white">
      <HomeRevealEffects />

      {/* Hero */}
      <section className="relative isolate overflow-hidden px-6 pb-20 pt-[clamp(8rem,18svh,11rem)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 h-[720px] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(179,32,42,0.42),transparent_70%)]"
        />
        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center text-center reveal">
          <Image
            src="/crest-transparent.png"
            alt=""
            width={96}
            height={96}
            className="h-20 w-20 sm:h-24 sm:w-24"
          />
          <h1
            className={`${bungee.className} mt-6 text-[2.6rem] leading-[1.06] text-[#f8ead4] sm:text-6xl lg:text-7xl`}
          >
            Welcome back,
            <span className="block text-[#cf3640]">alumni.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80 sm:text-xl">
            Graduating doesn&apos;t end your time with Delta Gamma. A website
            account keeps you close to the chapter you helped build.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <Link
              href={ALUMNI_SIGN_UP}
              className="tt-button-primary tt-button-plain inline-flex items-center justify-center"
            >
              Get your account
            </Link>
            <Link
              href="/alumni/stay-connected"
              className="tt-button-secondary tt-button-plain inline-flex items-center justify-center text-center"
            >
              Minutes and newsletters
            </Link>
          </div>
        </div>
      </section>

      {/* What the site is for */}
      <section className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-4 reveal">
        <h2
          className={`${bungee.className} mx-auto max-w-3xl text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          What the site is for
        </h2>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {uses.map((use) => {
            const Icon = use.icon;
            return (
              <div
                key={use.title}
                className="rounded-[26px] border border-white/10 bg-[#1b0f0f] px-7 py-8 shadow-[0_12px_24px_rgba(0,0,0,0.35)] transition duration-200 hover:-translate-y-1 hover:border-[#e2ab16]/30"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#e2ab16]/10 text-[#e2ab16]">
                  <Icon className="text-lg" />
                </span>
                <h3 className={`${bungee.className} mt-5 text-xl text-[#f5d79a]`}>
                  {use.title}
                </h3>
                <p className="mt-3 text-base text-white/65">{use.copy}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How to get started */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-24 reveal">
        <h2
          className={`${bungee.className} text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          How to get started
        </h2>
        <ol className="mt-12 space-y-5">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-5 rounded-[26px] border border-white/10 bg-[#1b0f0f] px-6 py-6"
            >
              <span
                className={`${bungee.className} flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#b3202a] text-lg text-[#f8ead4]`}
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-[#f5d79a]">
                  {step.title}
                </h3>
                <p className="mt-1 text-base text-white/70">{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA */}
      <section className="relative mx-4 mb-20 overflow-hidden rounded-[36px] bg-[#fdf7df] px-6 py-16 text-[#120a0a] lg:mx-10 reveal">
        <Image
          src="/gear_corner.png"
          alt=""
          width={801}
          height={799}
          className="pointer-events-none absolute -bottom-32 -left-24 w-[320px] opacity-70 sm:w-[420px]"
        />
        <Image
          src="/gear_small.png"
          alt=""
          width={401}
          height={343}
          className="pointer-events-none absolute right-4 top-0 w-[140px] opacity-70 sm:w-[190px]"
        />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <h2
            className={`${bungee.className} text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
          >
            Ready to reconnect?
          </h2>
          <p className="mt-5 text-lg text-[#3b1f1f]">
            It takes a few minutes. Questions? Email{" "}
            <a href="mailto:general@ttdg.org" className="font-semibold underline">
              general@ttdg.org
            </a>
            .
          </p>
          <div className="mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <Link
              href={ALUMNI_SIGN_UP}
              className="tt-button-primary tt-button-plain inline-flex items-center justify-center"
            >
              Get your account
            </Link>
            <Link
              href="/sign-in"
              className="tt-button-secondary tt-button-plain inline-flex items-center justify-center text-center !border-[#b3202a] !text-[#b3202a] hover:!bg-[#b3202a] hover:!text-[#fdf7df]"
            >
              I already have one
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
