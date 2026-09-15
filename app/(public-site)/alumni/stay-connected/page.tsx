import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FaCalendarCheck, FaFileAlt, FaNewspaper } from "react-icons/fa";
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
    copy: "After every chapter meeting, a written summary of what was discussed and decided lands in your inbox. Every past set is kept on the site as well.",
    cadence: "Weekly while school is in session",
    icon: FaFileAlt,
  },
  {
    title: "Newsletters",
    copy: "A longer look at what the chapter has been up to: new members, service projects, competitions, and where brothers have ended up.",
    cadence: "A few times a year",
    icon: FaNewspaper,
  },
  {
    title: "Event invitations",
    copy: "Events that are open to alumni show up on your calendar in the member area, and the bigger ones come with an emailed invitation.",
    cadence: "As they are scheduled",
    icon: FaCalendarCheck,
  },
];

const howItWorks = [
  {
    title: "You create an account",
    copy: "Sign up with the email address you actually check, and fill out the short form that follows.",
  },
  {
    title: "An officer approves you",
    copy: "A real person confirms you are a brother. You get an email when the request arrives, and another once it has been reviewed.",
  },
  {
    title: "You are added to the lists",
    copy: "Approval puts you on the minutes list and the newsletter list automatically. There is no second form and nothing to subscribe to.",
  },
];

const troubleshooting = [
  {
    title: "Check that you were approved",
    copy: "Approval is not automatic. If an officer has approved you, there is an email from us saying so. If you cannot find one, your request may still be waiting.",
  },
  {
    title: "Check the right inbox",
    copy: "We send to the exact address you signed up with. If you signed up with an old school address, that is where everything is going.",
  },
  {
    title: "Look in spam and Promotions",
    copy: "Mail from a new sender often lands there. Find one of our messages, mark it as not spam, and later ones should arrive normally.",
  },
  {
    title: "Still nothing",
    copy: "Write to general@ttdg.org, tell us the address you signed up with, and a brother will sort it out for you.",
  },
];

export default function StayConnectedPage() {
  return (
    <main className="overflow-x-hidden bg-[#120a0a] text-white">
      <HomeRevealEffects />

      {/* Hero */}
      <section className="relative isolate min-h-[56vh] w-full overflow-hidden">
        <Image
          src="/everyone.jpg"
          alt="Delta Gamma brothers together on A Mountain"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[56vh] flex-col items-start justify-end px-6 pb-14 pt-[clamp(7rem,16svh,10rem)] sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            For alumni
          </p>
          <h1
            className={`${bungee.className} mt-3 text-[2.6rem] leading-[1.06] text-[#f8ead4] sm:text-6xl lg:text-7xl`}
          >
            Stay in
            <span className="block text-[#cf3640]">the loop.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/85 sm:text-xl">
            Minutes and newsletters go out to approved members of this site.
            Once an officer approves your account, you are added to both lists
            and the mail starts arriving on its own.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-20 reveal">
        <p className="text-center text-sm uppercase tracking-[0.3em] text-[#e2ab16]">
          Start here
        </p>
        <h2
          className={`${bungee.className} mx-auto mt-4 max-w-3xl text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          How it works
        </h2>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {howItWorks.map((step, index) => (
            <li
              key={step.title}
              className="rounded-[26px] border border-white/10 bg-[#1b0f0f] px-7 py-8"
            >
              <span
                className={`${bungee.className} flex h-11 w-11 items-center justify-center rounded-full bg-[#b3202a] text-lg text-[#f8ead4]`}
              >
                {index + 1}
              </span>
              <h3 className={`${bungee.className} mt-5 text-xl text-[#f5d79a]`}>
                {step.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-white/65">
                {step.copy}
              </p>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-10 max-w-2xl text-center text-lg text-white/70">
          Not signed up yet? The{" "}
          <Link href="/alumni" className="font-semibold text-[#e2ab16] underline">
            alumni page
          </Link>{" "}
          walks through every step with pictures.
        </p>
      </section>

      {/* What arrives */}
      <section className="border-y border-white/10 bg-[#170c0c] py-20">
        <div className="mx-auto w-full max-w-[1180px] px-6 reveal">
          <p className="text-center text-sm uppercase tracking-[0.3em] text-[#e2ab16]">
            Once you are approved
          </p>
          <h2
            className={`${bungee.className} mx-auto mt-4 max-w-3xl text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
          >
            What lands in your inbox
          </h2>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {deliveries.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex flex-col rounded-[26px] border border-white/10 bg-[#1b0f0f] px-7 py-8 shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#e2ab16]/10 text-[#e2ab16]">
                    <Icon className="text-lg" />
                  </span>
                  <h3
                    className={`${bungee.className} mt-5 text-xl text-[#f5d79a]`}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-3 flex-1 text-base leading-relaxed text-white/65">
                    {item.copy}
                  </p>
                  <p className="mt-5 border-t border-white/10 pt-4 text-sm uppercase tracking-[0.2em] text-white/40">
                    {item.cadence}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mx-auto w-full max-w-3xl px-6 py-20 reveal">
        <p className="text-center text-sm uppercase tracking-[0.3em] text-[#e2ab16]">
          Troubleshooting
        </p>
        <h2
          className={`${bungee.className} mt-4 text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          Not getting them?
        </h2>
        <p className="mt-5 text-center text-lg text-white/70">
          Work down this list in order. It is almost always one of the first
          two.
        </p>
        <ol className="mt-12 space-y-5">
          {troubleshooting.map((tip, index) => (
            <li
              key={tip.title}
              className="flex gap-5 rounded-[26px] border border-white/10 bg-[#1b0f0f] px-6 py-6"
            >
              <span
                className={`${bungee.className} flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e2ab16]/15 text-lg text-[#e2ab16]`}
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-[#f5d79a]">
                  {tip.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-white/70">
                  {tip.copy}
                </p>
              </div>
            </li>
          ))}
        </ol>
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
          <p className="mt-5 text-lg text-[#3b1f1f]">
            That is the only thing standing between you and the next set of
            minutes.
          </p>
          <div className="mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <Link
              href="/sign-up?from=alumni"
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
