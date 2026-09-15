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
import StepShot from "./StepShot";
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
    title: "Meeting minutes",
    copy: "A written summary of every chapter meeting, sent to your inbox and kept on the site so you can read back through them.",
    icon: FaFileAlt,
  },
  {
    title: "Newsletters",
    copy: "Every issue the chapter puts out, delivered by email when it goes out.",
    icon: FaNewspaper,
  },
  {
    title: "Events",
    copy: "See what the chapter has coming up, and RSVP to the events that are open to alumni.",
    icon: FaCalendarCheck,
  },
  {
    title: "Brother directory",
    copy: "Look up the brothers you pledged with, and the ones who came after you.",
    icon: FaUsers,
  },
  {
    title: "Family tree",
    copy: "Your bigs, your littles, and every line in the chapter since it started.",
    icon: FaSitemap,
  },
  {
    title: "Chapter email",
    copy: "Ask for a ttdg.org address you can keep using as an alum.",
    icon: FaEnvelope,
  },
];

// Each screenshot is a real capture of ttdg.org. A step with no `shot` renders
// full width instead of leaving an empty column.
const steps: {
  title: string;
  copy: string;
  detail?: string;
  shot?: { src: string; alt: string; width: number; height: number; caption: string };
}[] = [
  {
    title: "Create an account",
    copy: "Go to the sign-up page and fill in your name, your email address, and a password. If you would rather not keep track of another password, use the Continue with Google or Continue with Apple button at the top and sign in the way you already do.",
    detail: "Use whichever email address you actually check. That is where every chapter email gets sent.",
    shot: {
      src: "/alumni/step-1-create-account.webp",
      alt: "The Theta Tau sign-up page, with buttons to continue with Google or Apple above fields for first name, last name, email address, and password.",
      width: 1200,
      height: 1133,
      caption: "Step one: ttdg.org/sign-up",
    },
  },
  {
    title: "Confirm your email address",
    copy: "We send a six digit code to the address you entered. Open that email and type the code into the box on the screen. If it has not turned up after a minute, look in your spam folder, or use the link to send a new code.",
    shot: {
      src: "/alumni/step-2-verify-email.webp",
      alt: "A screen reading Check your email, with a box for the six digit verification code and a button that says Verify and continue.",
      width: 1200,
      height: 737,
      caption: "Step two: the code we email you",
    },
  },
  {
    title: "Tell us who you are",
    copy: "Next comes a short form. Your roll number and a phone number are the only two things we have to have. Add your pledge class and graduation year as well if you remember them, since that is how an officer confirms you are a brother.",
    detail: "Make sure the box that says you are an alum is checked. Coming to this page from the button above ticks it for you. You can ignore the Discord box unless you want to join the chapter server.",
    shot: {
      src: "/alumni/step-3-your-details.webp",
      alt: "The onboarding form, showing the name and email taken from sign-in and a checked box reading I am an alum, graduated.",
      width: 1200,
      height: 743,
      caption: "Step three: the profile form",
    },
  },
  {
    title: "Wait for an officer to approve you",
    copy: "Your request goes into a queue that a real person reviews by hand, so it is not instant. Until then your account shows as pending and the member tools stay locked. Nothing else is needed from you.",
    detail: "Once you are approved, you are added to the minutes and newsletter lists automatically. There is no second form to fill out.",
    shot: {
      src: "/alumni/step-4-awaiting-approval.webp",
      alt: "The member home page showing a status of Pending, the words Awaiting approval, and a list of locked member tools.",
      width: 1200,
      height: 740,
      caption: "Step four: what you see while you wait",
    },
  },
];

export default function AlumniPage() {
  return (
    <main className="overflow-x-hidden bg-[#120a0a] text-white">
      <HomeRevealEffects />

      {/* Hero */}
      <section className="relative isolate min-h-[68vh] w-full overflow-hidden">
        <Image
          src="/grad-sp26.jpeg"
          alt="Delta Gamma brothers at graduation"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[68vh] flex-col items-start justify-end px-6 pb-14 pt-[clamp(7rem,16svh,10rem)] sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Delta Gamma Chapter
          </p>
          <h1
            className={`${bungee.className} mt-3 text-[2.6rem] leading-[1.06] text-[#f8ead4] sm:text-6xl lg:text-7xl`}
          >
            Welcome back,
            <span className="block text-[#cf3640]">alumni.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/85 sm:text-xl">
            Graduating does not end your time with Delta Gamma. A free account
            on this site keeps you close to the chapter you helped build.
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
      <section className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-20 reveal">
        <p className="text-center text-sm uppercase tracking-[0.3em] text-[#e2ab16]">
          What you get
        </p>
        <h2
          className={`${bungee.className} mx-auto mt-4 max-w-3xl text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
        >
          What this site is for
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-white/70">
          One account covers all of it. There is nothing to pay and nothing to
          install.
        </p>
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
                <p className="mt-3 text-base leading-relaxed text-white/65">
                  {use.copy}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How to get started */}
      <section className="border-y border-white/10 bg-[#170c0c] py-20">
        <div className="mx-auto w-full max-w-[1180px] px-6">
          <div className="reveal">
            <p className="text-center text-sm uppercase tracking-[0.3em] text-[#e2ab16]">
              Step by step
            </p>
            <h2
              className={`${bungee.className} mx-auto mt-4 max-w-3xl text-center text-3xl leading-tight text-[#b3202a] sm:text-5xl`}
            >
              How to get started
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-white/70">
              Four steps, about five minutes. Here is exactly what each screen
              looks like.
            </p>
          </div>

          <ol className="mt-16 space-y-16">
            {steps.map((step, index) => (
              <li key={step.title} className="reveal">
                <div
                  className={`grid items-center gap-10 ${
                    step.shot ? "lg:grid-cols-2" : ""
                  }`}
                >
                  <div
                    className={
                      step.shot
                        ? index % 2 === 1
                          ? "lg:order-2"
                          : ""
                        : "mx-auto max-w-3xl"
                    }
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`${bungee.className} flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#b3202a] text-xl text-[#f8ead4]`}
                      >
                        {index + 1}
                      </span>
                      <h3
                        className={`${bungee.className} text-2xl text-[#f5d79a] sm:text-3xl`}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-5 text-lg leading-relaxed text-white/80">
                      {step.copy}
                    </p>
                    {step.detail ? (
                      <p className="mt-4 border-l-2 border-[#e2ab16]/50 pl-4 text-base leading-relaxed text-white/60">
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                  {step.shot ? (
                    <StepShot
                      src={step.shot.src}
                      alt={step.shot.alt}
                      width={step.shot.width}
                      height={step.shot.height}
                      caption={step.shot.caption}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="reveal mt-16 flex justify-center">
            <Link
              href={ALUMNI_SIGN_UP}
              className="tt-button-primary tt-button-plain inline-flex items-center justify-center"
            >
              Start step one
            </Link>
          </div>
        </div>
      </section>

      {/* Help */}
      <section className="mx-auto w-full max-w-3xl px-6 py-20 text-center reveal">
        <h2
          className={`${bungee.className} text-2xl leading-tight text-[#f5d79a] sm:text-3xl`}
        >
          Stuck anywhere along the way?
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-white/70">
          Email{" "}
          <a
            href="mailto:general@ttdg.org"
            className="font-semibold text-[#e2ab16] underline"
          >
            general@ttdg.org
          </a>{" "}
          and tell us where you got stuck. A brother will write back and walk you
          through it.
        </p>
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
            It takes about five minutes, and it is free.
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
