// lib/rush/defaults.ts
// The /rush page exactly as it was hardcoded before the editor existed. With no
// RushPage document in the database the page renders from these, so shipping
// the editor changes nothing until somebody saves.
import type { RushPageData } from "./types";

/// Phoenix is UTC-7 all year (no DST), so these are exact.
const phx = (local: string) => new Date(`${local}-07:00`).toISOString();

export const DEFAULT_POSTER_SRC = "/rush/Fall2026_Rush.jpg";

export const RUSH_DEFAULTS: RushPageData = {
  isOpen: true,
  eyebrow: "Fall 2026 Recruitment",
  title: "Rush Theta Tau",
  intro:
    "Fall 2026 Rush is here. Join us for two weeks of free events, meet the brotherhood, and discover what Theta Tau can add to your ASU experience.",
  closedIntro: "",
  closedMessage: "Rush for this semester has ended.",
  interestFormUrl: "https://airtable.com/appgjGGPxHjbzUs5U/pagGkFkzKTCxjJNU1/form",
  interestFormLabel: "Rush Interest Form",
  eventsHeading: "Remaining Fall 2026 Events",
  whyText:
    "For engineering students at ASU, Theta Tau isn't just another organization. It's where careers are shaped, lasting friendships are built, and the kind of professional network that follows you beyond graduation starts to form. As the oldest and largest co-ed engineering fraternity in the nation, Theta Tau offers something clubs can't: a proven path from student to engineer, backed by a brotherhood that invests in you. Whether you're looking to sharpen your technical edge, step into leadership, or find your people in a demanding major, rushing Theta Tau might be the most valuable decision you make at ASU.",
  startTitle: "The Theta Tau Start.",
  startText:
    "After you say “yes” to Theta Tau, you step into our new member education process: a structured and supportive path that builds brotherhood, develops leadership, and connects you to the people who make this chapter feel like home.",
  events: [
    { title: "Game Night", startsAt: phx("2026-08-25T19:00:00"), location: "GWC 487", featuring: "Featuring Board Game Club", hidden: false },
    { title: "Jeopardy Night", startsAt: phx("2026-08-26T19:00:00"), location: "GWC 487", hidden: false },
    { title: "Engineering Challenge", startsAt: phx("2026-08-28T19:00:00"), location: "GWC 487", hidden: false },
    { title: "Chips and Salsa Lessons", startsAt: phx("2026-09-01T19:00:00"), location: "BDH 192", featuring: "Featuring IEEE and Salsa Club", hidden: false },
    { title: "Engineers in Service", startsAt: phx("2026-09-03T19:00:00"), location: "GWC 487", hidden: false },
    { title: "Meet the House", startsAt: phx("2026-09-04T18:30:00"), location: "MU 202", hidden: false },
  ],
  poster: { key: null, width: 1080, height: 1350, alt: "Rush flyer", hidden: false },
};
