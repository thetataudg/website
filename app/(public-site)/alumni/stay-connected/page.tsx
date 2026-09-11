import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  FaCalendarCheck,
  FaCheckCircle,
  FaFileAlt,
  FaNewspaper,
} from "react-icons/fa";
import { pageMetadata } from "@/lib/seo";
import HomeRevealEffects from "../../components/HomeRevealEffects";
import { bungee } from "../../../fonts";

export const metadata: Metadata = pageMetadata({
  title: "Stay Connected",
  description:
    "Approved alumni accounts receive Delta Gamma meeting minutes and newsletters by email, plus access to chapter events.",
  path: "/alumni/stay-connected",
});

// Delivery runs through lib/googleGroups.ts: approved Alumni sync into
// alumni@, which is a member of both minutes@ and newsletter@.
const deliveries = [
  {
    title: "Meeting minutes",
    copy: "After each chapter meeting, the minutes land in your inbox. Every past meeting is also on the site.",
    icon: FaFileAlt,
  },
  {
    title: "Newsletters",
    copy: "Every issue, sent to you when it goes out.",
    icon: FaNewspaper,
  },
  {
    title: "Events",
    copy: "Events open to alumni show up on your calendar in the member portal, and some come with an email invite.",
    icon: FaCalendarCheck,
  },
];

const troubleshooting = [
  "Make sure your account has been approved. You'll have an approval email if it has.",
  "Look in the inbox for the email you signed up with. That's the address we send to.",
  "Check spam and the Promotions tab, and mark us as not spam.",
  "Still nothing? Email general@ttdg.org and we'll sort it out.",
];

export default function StayConnectedPage() {
  return (
    <main className="overflow-x-hidden bg-[#120a0a] text-white">
      <HomeRevealEffects />

      {/* Hero */}
      <section className="relative isolate overflow-hidden px-6 pb-16 pt-[clamp(8rem,18svh,11rem)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 h-[720px] bg-[radial-gradient(60%_55%_at_50%_0%,rgba(179,32,42,0.42),transparent_70%)]"
        />
        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center text-center reveal">
          <h1
            className={`${bungee.className} text-[2.6rem] leading-[1.06] text-[#f8ead4] sm:text-6xl lg:text-7xl`}
          >
            Stay in
            <span className="block text-[#cf3640]">the loop.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80 sm:text-xl">
            Minutes and newsletters go to members of the website. Once your
            account is approved, you&apos;re added to both lists automatically.
          </p>
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto w-full max-w-[1180px] px-6 pb-24 reveal">
        <h2
          className={`${bungee.className} mx-auto max-w-3xl text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          What you get once approved
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {deliveries.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-[26px] border border-white/10 bg-[#1b0f0f] px-7 py-8 shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#e2ab16]/10 text-[#e2ab16]">
                  <Icon className="text-lg" />
                </span>
                <h3 className={`${bungee.className} mt-5 text-xl text-[#f5d79a]`}>
                  {item.title}
                </h3>
                <p className="mt-3 text-base text-white/65">{item.copy}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-24 reveal">
        <h2
          className={`${bungee.className} text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          Not getting them?
        </h2>
        <ul className="mt-10 space-y-4">
          {troubleshooting.map((tip) => (
            <li key={tip} className="flex items-start gap-3 text-lg text-white/75">
              <FaCheckCircle className="mt-1.5 shrink-0 text-[#e2ab16]" aria-hidden="true" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Closing CTA */}
      <section className="relative mx-4 mb-20 overflow-hidden rounded-[36px] bg-[#fdf7df] px-6 py-16 text-[#120a0a] lg:mx-10 reveal">
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
            No account yet?
          </h2>
          <div className="mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <Link
              href="/sign-up?from=alumni"
              className="tt-button-primary tt-button-plain inline-flex items-center justify-center"
            >
              Get your account
            </Link>
            <Link
              href="/member"
              className="tt-button-secondary tt-button-plain inline-flex items-center justify-center text-center !border-[#b3202a] !text-[#b3202a] hover:!bg-[#b3202a] hover:!text-[#fdf7df]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
