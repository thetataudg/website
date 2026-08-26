import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  FaApple,
  FaCheckCircle,
  FaCalendarCheck,
  FaBell,
  FaVoteYea,
  FaWallet,
  FaGem,
  FaNewspaper,
  FaUsers,
  FaFileAlt,
  FaMoneyBillWave,
  FaSitemap,
} from "react-icons/fa";
import { pageMetadata } from "@/lib/seo";
import HomeRevealEffects from "../components/HomeRevealEffects";
import { bungee } from "../../fonts";

// app.ttdg.org forwards to the App Store listing, so the listing's id can change
// without this page needing a deploy.
const APP_STORE_URL = "https://app.ttdg.org";

export const metadata: Metadata = pageMetadata({
  title: "Theta Tau on iPhone",
  description:
    "The Delta Gamma member app puts dues, minutes, events, the roster, and chapter voting in your pocket. Built for the ASU Theta Tau chapter and free for every brother.",
  path: "/mobile",
});

type Feature = {
  eyebrow: string;
  title: string;
  copy: string;
  bullets: string[];
  icon: React.ComponentType<{ className?: string }>;
  image: string;
  alt: string;
  width: number;
  height: number;
};

const features: Feature[] = [
  {
    eyebrow: "Dues",
    title: "Know what you owe",
    copy: "Your balance and the date it is due are the first thing on the screen. Report a payment the second you send it and it goes straight into the treasurer's queue, so you are not marked late for something you already paid.",
    bullets: [
      "Report a payment and watch it clear",
      "Send a reimbursement with a photo of the receipt",
    ],
    icon: FaMoneyBillWave,
    image: "/mobile/app-dues.png",
    alt: "The dues screen showing an outstanding balance and a payment waiting on the treasurer",
    width: 900,
    height: 1862,
  },
  {
    eyebrow: "Minutes",
    title: "Minutes you can actually find",
    copy: "Every chapter meeting, filed by date, with attendance and quorum right on the card. Miss a meeting and the summary is already there. The full minutes are one tap further.",
    bullets: [
      "Attendance counts and quorum flags",
      "Search old meetings and save a PDF",
    ],
    icon: FaFileAlt,
    image: "/mobile/app-minutes.png",
    alt: "The minutes screen listing chapter meetings by date with attendance counts",
    width: 891,
    height: 1842,
  },
  {
    eyebrow: "Brothers",
    title: "The whole roster, searchable",
    copy: "Look someone up by name, roll number, or major. Officers are marked, profiles carry whatever a brother chose to share, and the list loads the moment you open it.",
    bullets: [
      "Search by name, roll number, or major",
      "Officer badges and full brother profiles",
    ],
    icon: FaUsers,
    image: "/mobile/app-brothers.png",
    alt: "The brothers directory showing chapter members with roll numbers and majors",
    width: 891,
    height: 1842,
  },
  {
    eyebrow: "Committees",
    title: "Know who runs what",
    copy: "Every committee, its head, and everyone on it. Chairs keep their own rosters up to date from the same screen, so the list stops going stale halfway through the semester.",
    bullets: [
      "Committee heads and current members",
      "Chairs update rosters from the app",
    ],
    icon: FaSitemap,
    image: "/mobile/app-committees.png",
    alt: "The committees screen listing chapter committees and their heads",
    width: 900,
    height: 1862,
  },
];

const extras = [
  {
    title: "Events and check in",
    copy: "The chapter calendar, plus a code officers can scan at the door instead of passing a sheet around.",
    icon: FaCalendarCheck,
  },
  {
    title: "GEM points",
    copy: "Where you stand this term, and what you still have left to do.",
    icon: FaGem,
  },
  {
    title: "Newsletters",
    copy: "Every issue the chapter puts out, read in the app instead of lost in your inbox.",
    icon: FaNewspaper,
  },
  {
    title: "Voting",
    copy: "Ballots open on your phone during the meeting and close when the vote does.",
    icon: FaVoteYea,
  },
  {
    title: "Notifications",
    copy: "Dues reminders, event changes, and officer announcements, without opening the app.",
    icon: FaBell,
  },
  {
    title: "Apple Wallet pass",
    copy: "Your member card sits in Wallet and updates itself when your standing changes.",
    icon: FaWallet,
  },
];

function AppIcon({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/mobile/app-icon.png"
      alt=""
      width={512}
      height={512}
      className={`shrink-0 drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)] ${className}`}
    />
  );
}

function DownloadButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      className={`tt-button-primary tt-button-plain inline-flex items-center justify-center gap-2.5 ${className}`}
    >
      <FaApple className="text-[20px]" aria-hidden="true" />
      Download the app
    </a>
  );
}

export default function MobilePage() {
  return (
    <main className="overflow-x-hidden bg-[#120a0a] text-white">
      <HomeRevealEffects />

      {/* Hero */}
      <section className="relative isolate overflow-hidden px-6 pb-20 pt-[clamp(6rem,13svh,9rem)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 h-[720px] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(179,32,42,0.42),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[26rem] h-[560px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(226,171,22,0.18),transparent_72%)]"
        />

        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center text-center reveal">
          <AppIcon className="h-20 w-20 sm:h-24 sm:w-24" />

          <h1
            className={`${bungee.className} mt-6 text-[2.6rem] leading-[1.06] text-[#f8ead4] sm:text-6xl lg:text-7xl`}
          >
            Delta Gamma
            <span className="block text-[#cf3640]">goes mobile.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-lg text-white/80 sm:text-xl">
            Dues, minutes, events, the roster, and chapter voting.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <DownloadButton />
            <a
              href="#features"
              className="tt-button-secondary tt-button-plain inline-flex items-center justify-center text-center"
            >
              See what it does
            </a>
          </div>
        </div>

        {/* Hero device */}
        <div className="relative mx-auto mt-8 flex w-full max-w-md justify-center reveal">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-16 -z-10 h-[70%] rounded-[999px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(226,171,22,0.28),transparent_70%)] blur-2xl"
          />
          <Image
            src="/mobile/app-welcome.png"
            alt="The Theta Tau member app welcome screen on an iPhone"
            width={820}
            height={1696}
            priority
            sizes="(max-width: 768px) 88vw, 420px"
            className="h-auto w-full max-w-[420px] drop-shadow-[0_40px_70px_rgba(0,0,0,0.6)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#120a0a]"
          />
        </div>
      </section>

      {/* Section intro */}
      <section
        id="features"
        className="scroll-mt-28 px-6 pb-4 pt-10 text-center reveal"
      >
        <h2
          className={`${bungee.className} mx-auto max-w-3xl text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          What you'll actually use it for
        </h2>
      </section>

      {/* Alternating feature rows */}
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-10">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          const flipped = index % 2 === 1;

          return (
            <section
              key={feature.title}
              className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:gap-20 lg:py-24"
            >
              <div className={`reveal ${flipped ? "lg:order-2" : ""}`}>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e2ab16]/25 bg-[#e2ab16]/10 text-[#e2ab16]">
                  <Icon className="text-xl" />
                </span>
                <p className="mt-6 text-sm font-semibold text-white/45">
                  {feature.eyebrow}
                </p>
                <h3
                  className={`${bungee.className} mt-2 text-2xl leading-tight text-[#cf3640] sm:text-4xl`}
                >
                  {feature.title}
                </h3>
                <p className="mt-5 text-lg text-white/75">{feature.copy}</p>
                <ul className="mt-7 space-y-3">
                  {feature.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-3 text-base text-white/70"
                    >
                      <FaCheckCircle
                        className="mt-1 shrink-0 text-[#e2ab16]"
                        aria-hidden="true"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className={`relative flex justify-center reveal ${
                  flipped ? "lg:order-1" : ""
                }`}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-8 -z-10 rounded-[999px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(179,32,42,0.30),transparent_70%)] blur-2xl"
                />
                <Image
                  src={feature.image}
                  alt={feature.alt}
                  width={feature.width}
                  height={feature.height}
                  sizes="(max-width: 1024px) 72vw, 380px"
                  className="h-auto w-full max-w-[340px] drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)] sm:max-w-[380px]"
                />
              </div>
            </section>
          );
        })}
      </div>

      {/* Extras grid */}
      <section className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-8 reveal">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            className={`${bungee.className} text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
          >
            The rest of the chapter
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {extras.map((extra) => {
            const Icon = extra.icon;
            return (
              <div
                key={extra.title}
                className="rounded-[26px] border border-white/10 bg-[#1b0f0f] px-7 py-8 shadow-[0_12px_24px_rgba(0,0,0,0.35)] transition duration-200 hover:-translate-y-1 hover:border-[#e2ab16]/30 hover:shadow-[0_18px_32px_rgba(0,0,0,0.45)]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#e2ab16]/10 text-[#e2ab16]">
                  <Icon className="text-lg" />
                </span>
                <h3
                  className={`${bungee.className} mt-5 text-xl text-[#f5d79a]`}
                >
                  {extra.title}
                </h3>
                <p className="mt-3 text-base text-white/65">{extra.copy}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative mx-4 mb-20 overflow-hidden rounded-[36px] bg-[#fdf7df] px-6 py-16 text-[#120a0a] lg:mx-10 reveal">
        <Image
          src="/gear_corner.png"
          alt=""
          width={801}
          height={799}
          className="pointer-events-none absolute -left-24 -bottom-32 w-[320px] opacity-70 sm:w-[420px]"
        />
        <Image
          src="/gear_small.png"
          alt=""
          width={401}
          height={343}
          className="pointer-events-none absolute right-4 top-0 w-[140px] opacity-70 sm:w-[190px]"
        />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <AppIcon className="h-20 w-20" />
          <h2
            className={`${bungee.className} mt-7 text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
          >
            Ready when you are
          </h2>
          <p className="mt-5 text-lg text-[#3b1f1f]">
            Sign in with your chapter account and you are caught up in about a
            minute.
          </p>
          <div className="mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <DownloadButton />
            <Link
              href="/rush"
              className="tt-button-secondary tt-button-plain inline-flex items-center justify-center text-center !border-[#b3202a] !text-[#b3202a] hover:!bg-[#b3202a] hover:!text-[#fdf7df]"
            >
              Not a member yet?
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
