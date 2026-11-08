// lib/rush/types.ts
// The shape of the public /rush page, shared by the model, the editor and the
// public page. Plain data only, so the pure checks can import it.

export interface RushEventData {
  _id?: string;
  title: string;
  /// ISO instant. Entered and displayed in America/Phoenix.
  startsAt: string;
  location: string;
  featuring?: string;
  hidden?: boolean;
}

export interface RushPosterData {
  key: string | null;
  width: number;
  height: number;
  alt: string;
  hidden: boolean;
}

export interface RushPageData {
  isOpen: boolean;
  eyebrow: string;
  title: string;
  intro: string;
  closedIntro: string;
  closedMessage: string;
  interestFormUrl: string;
  interestFormLabel: string;
  eventsHeading: string;
  whyText: string;
  startTitle: string;
  startText: string;
  events: RushEventData[];
  poster: RushPosterData;
}

/// What the public page receives: the doc plus server-formatted labels.
export interface RushEventView {
  key: string;
  title: string;
  startsAt: string;
  /// "August 25 · 7:00 PM", formatted in Phoenix on the server.
  label: string;
  location: string;
  featuring?: string;
}

export interface RushPageView extends Omit<RushPageData, "events" | "poster"> {
  events: RushEventView[];
  posterSrc: string | null;
  posterWidth: number;
  posterHeight: number;
  posterAlt: string;
}
