"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

type RushEvent = {
  date: string;
  time: string;
  title: string;
  location: string;
  year: number;
};

const rushEvents: RushEvent[] = [
  {
    date: "January 23",
    time: "7:00 PM",
    title: "Berk Bash",
    location: "GWC 487",
    year: 2026,
  },
  {
    date: "January 27",
    time: "7:00 PM",
    title: "Engineers in Service",
    location: "GWC 487",
    year: 2026,
  },
  {
    date: "January 28",
    time: "7:00 PM",
    title: "Wings & Wits: Jeopardy Night",
    location: "MU 241A (Ventana A)",
    year: 2026,
  },
  {
    date: "January 30",
    time: "6:00 PM",
    title: "Meet the House",
    location: "TKDR D101/102",
    year: 2026,
  },
];

const parseEventDate = (event: RushEvent) =>
  new Date(`${event.date} ${event.year} ${event.time}`);

const faqs = [
  {
    question: "What is Rush?",
    answer:
      "Rush is a two-week period full of fun events to help you get to know Theta Tau. We host info sessions, game nights, and much more! Attending rush events is the first step in becoming a member of Theta Tau. All events are FREE, and often have free food. So stop by and have some fun!",
  },
  {
    question: "What is Pledging?",
    answer:
      "Pledging is your chance to determine if Theta Tau is the right fit for you, and prepares you for becoming a member. Pledging is the next step after rush, and is a semester long process. You will get to meet all its members, learn about the history of the chapter and the fraternity, participate in professional and service events, and form bonds which will last the rest of your life. You will help pick your ‘big brother’ who is an active member that will guide you through the pledging process, and for many years to come.",
  },
  {
    question: "Am I eligible to join?",
    answer:
      "You must meet the following requirements at the time of initiation: Be within an ABET accredited major at Arizona State University; Have at least 6 months before graduation; Have a minimum (passing GPA) of 2.0; Not be a member of a competing Fraternity or Sorority; At least 18 years old.",
  },
  {
    question: "What if I change my major from engineering?",
    answer:
      "As long as you are enrolled in engineering at the time of initiation, you will be a member of Theta Tau for life. While we focus on engineering, and most of our members complete degrees in engineering, we do have members change majors.",
  },
  {
    question: "How is Theta Tau different than an honors society?",
    answer:
      "Honor societies are great for being around people that share an academic interest with you. These are excellent groups for furthering your interests in a topic, but the benefits often stop there. Because Theta Tau is a brotherhood, you will join a group of people that take friendships beyond the classroom and even the campus, and treat you like part of a family. When you join Theta Tau you will make friendships that will last the rest of your life, anywhere you go.",
  },
  {
    question: "How do you pronounce “Theta Tau”?",
    answer:
      "THAY-Ta TAH. Notice the pronunciation of 'Tau' differs from the typical pronunciation you might hear in a Math class. This is not by mistake, but rather a Greek Grammatical rule.",
  },
];

type WallTile =
  | { type: "image"; src: string; alt: string }
  | { type: "quote"; text: string };

const wallImages: WallTile[] = [
  { type: "image", src: "/randPic3.jpg", alt: "Ball pit event" },
  { type: "image", src: "/tabling_4.jpg", alt: "Tabling event" },
  { type: "image", src: "/game.jpg", alt: "Group game night" },
  { type: "image", src: "/rush_2.jpg", alt: "Rush night" },
  { type: "image", src: "/movie.jpg", alt: "Movie night" },
  { type: "image", src: "/group_2.jpg", alt: "Brotherhood group" },
  { type: "image", src: "/rush_4.jpg", alt: "Rush gathering" },
  { type: "image", src: "/fun.jpg", alt: "Brotherhood fun" },
  { type: "image", src: "/rush_1.jpg", alt: "Rush event" },
  { type: "image", src: "/formal.jpg", alt: "Formal event" },
  { type: "image", src: "/service.jpg", alt: "Service project" },
  { type: "image", src: "/service_2.jpg", alt: "Service event" },
  { type: "image", src: "/project.jpg", alt: "Project work" },
  { type: "image", src: "/athletic.JPG", alt: "Athletic outing" },
  { type: "image", src: "/group_1.jpg", alt: "Chapter photo" },
];

const wallQuotes = [
  "A family away from home.",
  "Professional growth with real support.",
  "Memories that last far beyond college.",
  "Friends who push you to be your best.",
  "Leadership skills that show up anywhere.",
  "Opportunities to network with alumni.",
  "Confidence built through shared wins.",
  "Giving back together feels powerful.",
  "A brotherhood that shows up for you.",
  "Teamwork that turns ideas into reality.",
  "Great memories, a lot of fun.",
  "Community, service, and lifelong bonds.",
];

const wallTiles: WallTile[] = [];
const tilesNeeded = 24;
const columnsPerRow = 4;
const totalRows = Math.ceil(tilesNeeded / columnsPerRow);
let imageIndex = 0;
let quoteIndex = 0;

for (let row = 0; row < totalRows; row += 1) {
  const startsWithImage = row % 2 === 0;
  for (let col = 0; col < columnsPerRow; col += 1) {
    const useImage = startsWithImage ? col % 2 === 0 : col % 2 !== 0;
    if (useImage) {
      wallTiles.push(wallImages[imageIndex % wallImages.length]);
      imageIndex += 1;
    } else {
      wallTiles.push({
        type: "quote",
        text: wallQuotes[quoteIndex % wallQuotes.length],
      });
      quoteIndex += 1;
    }
  }
}

wallTiles.splice(tilesNeeded);

const quoteStyles = [
  { bg: "bg-[#6f0b12]", text: "text-white", ring: "ring-1 ring-white/15" },
  { bg: "bg-[#e2ab16]", text: "text-[#1b0f0f]", ring: "ring-1 ring-[#1b0f0f]/15" },
];

export default function Rush() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const upcomingEvents = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rushEvents
      .map((event) => ({ ...event, dateValue: parseEventDate(event) }))
      .filter((event) => event.dateValue >= today)
      .sort((a, b) => a.dateValue.getTime() - b.dateValue.getTime());
  }, []);

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
          src="/mth.jpg"
          fill
          priority
          alt="Theta Tau rush tabling"
          className="object-cover object-[40%_40%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/55 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[70vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Recruitment
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Rush Theta Tau
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Rush for the Spring 2026 semester is open. Fill out the interest form
            and show up to our rush events on campus.
          </p>
          <a
            href="https://airtable.com/appQEL10mm4gp9XDx/pagGkFkzKTCxjJNU1/form"
            target="_blank"
            className="tt-button-primary mt-8"
          >
            Rush Interest Form
          </a>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="flex flex-col justify-center">
            <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
              Why Rush Theta Tau?
            </h2>
            <p className="mt-4 text-xl leading-relaxed">
              Whether you want to build connections, develop professional skills,
              or just come for the free pizza, there are plenty of reasons to rush
              Theta Tau. For many engineering students at ASU, Theta Tau is a defining
              part of their college experience. As the oldest and largest coed
              engineering fraternity in the nation, joining Theta Tau opens a world
              of possibilities for aspiring engineers.
            </p>
          </div>
          <div className="rounded-[28px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
            <p className="text-sm uppercase tracking-[0.25em] text-[#7a0104]">
              Rush Week
            </p>
            <h3 className={`${bungee.className} mt-3 text-2xl text-[#b3202a]`}>
              Remaining Spring 2026 Events
            </h3>
            <div className="mt-6 space-y-5">
              {upcomingEvents.length ? (
                upcomingEvents.map((event) => (
                  <div key={`${event.title}-${event.date}`} className="flex items-start gap-4">
                    <div className="mt-2 h-3 w-3 rounded-full bg-[#b3202a]" />
                    <div>
                      <p className="text-sm font-semibold uppercase text-[#7a0104]">
                        {event.date} · {event.time}
                      </p>
                      <p className="text-lg font-semibold text-[#1b0f0f]">
                        {event.title}
                      </p>
                      <p className="text-sm text-[#1b0f0f]/70">{event.location}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-base text-[#1b0f0f]">
                  Rush for this semester is now over.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-white p-6 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="relative overflow-hidden rounded-[28px]">
          <Image
            src="/ballpit.jpg"
            alt="Theta Tau new members"
            fill
            className="object-cover"
            sizes="(min-width: 1280px) 1200px, (min-width: 768px) 90vw, 100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
          <div className="relative z-10 max-w-xl p-6 sm:p-8">
            <div className="rounded-[28px] bg-[#fbf6dc] p-8 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
              <p className="text-xs uppercase tracking-[0.3em] text-[#7a0104]">
                New Members
              </p>
              <h2 className={`${bungee.className} mt-3 text-3xl text-[#1b0f0f]`}>
                The Theta Tau Start.
              </h2>
              <p className="mt-4 text-base text-[#1b0f0f]/80">
                After you say “yes” to Theta Tau, you step into our new member
                experience, a structured, supportive path that builds brotherhood,
                develops leadership, and connects you to the people who make this
                chapter feel like home.
              </p>
              <a
                href="https://airtable.com/appQEL10mm4gp9XDx/pagGkFkzKTCxjJNU1/form"
                className="tt-button-primary mt-6 inline-flex"
              >
                I'm Interested
              </a>
            </div>
          </div>
          <div className="pointer-events-none relative z-10 h-56 sm:h-72 lg:h-96" />
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#120a0a] px-8 py-12 text-white lg:mx-10 reveal">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="flex h-full flex-col items-center">
            <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
              Rush Timeline
            </p>
            <h2 className={`${bungee.className} mt-3 text-4xl text-[#b3202a]`}>
              What to Expect
            </h2>
            <div className="relative mt-10 w-full max-w-xl flex-1">
              <div className="absolute bottom-0 left-[11px] top-0 w-1 bg-[#b3202a] opacity-90" />
              <div
                className="grid h-full grid-cols-[24px,1fr] items-center gap-x-6 py-2"
                style={{
                  gridTemplateRows: `repeat(${rushEvents.length}, minmax(0, 1fr))`,
                }}
              >
                {rushEvents.map((event) => (
                  <React.Fragment key={`${event.title}-timeline`}>
                    <div className="flex items-center justify-center">
                      <span className="relative z-10 h-4 w-4 rounded-full bg-[#e2ab16] shadow-[0_0_0_2px_rgba(0,0,0,0.2)]" />
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className="text-sm uppercase tracking-[0.25em] text-white/70">
                        {event.date} · {event.time}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {event.title}
                      </p>
                      <p className="text-base text-white/70">{event.location}</p>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="h-full rounded-[28px] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <Image
              alt="Rush flyer"
              src="/rush/Rush_Poster_SP26.png"
              width={520}
              height={650}
              className="h-full w-full rounded-[22px] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.35em] text-[#7a0104]">
            The Rush Experience
          </p>
          <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
            What Our Members Say
          </h2>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {(() => {
            let quoteIndex = 0;
            return wallTiles.map((tile, index) => {
              const isQuote = tile.type === "quote";
              const row = Math.floor(index / columnsPerRow);
              const col = index % columnsPerRow;
              const quotePosition = Math.floor(col / 2);
              const quoteStyleIndex = (quotePosition + row) % quoteStyles.length;
              const quoteStyle = isQuote ? quoteStyles[quoteStyleIndex] : null;
              const tileDelay = `${index * 70}ms`;
              if (isQuote) quoteIndex += 1;

              return (
                <div
                  key={`${tile.type}-${index}`}
                  className={`aspect-square overflow-hidden rounded-[22px] ${
                    isQuote
                      ? `flex items-center justify-center px-5 text-center text-[0.95rem] font-semibold leading-snug tracking-tight sm:text-base lg:text-lg ${quoteStyle?.bg} ${quoteStyle?.text} ${quoteStyle?.ring} reveal reveal-fade text-balance`
                      : "bg-[#120a0a] reveal reveal-fade"
                  }`}
                  style={{ transitionDelay: tileDelay }}
                >
                  {"src" in tile ? (
                    <Image
                      src={tile.src}
                      alt={tile.alt}
                      width={320}
                      height={320}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>“{tile.text}”</span>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </section>

      <section className="mx-4 mt-10 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
          FAQs
        </h2>
        <div className="mt-6 space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.question}
                className={`rounded-[20px] border border-[#7a0104]/10 bg-white p-5 shadow-[0_8px_18px_rgba(0,0,0,0.08)]`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between text-left text-base font-semibold text-[#1b0f0f]"
                >
                  {faq.question}
                  <span
                    className={`ml-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#7a0104]/20 text-[#7a0104] transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="m8 10 4 4 4-4" />
                    </svg>
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p
                      className={`mt-4 text-base text-[#1b0f0f]/80 transition-opacity duration-300 ${
                        isOpen ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
