/**
 * The voting feature's shared vocabulary.
 *
 * Deliberately the same names and the same derived state as the iOS app's
 * `Vote.swift`, because both talk to the same `/api/vote*` routes and a member
 * who votes on their phone one week and their laptop the next should not be
 * learning two different sets of words for the same three things.
 */

export type VoteKind = "Election" | "Pledge" | "Bidding";
export type ProxyStatus = "pending" | "approved" | "denied";

/** Where a vote is in its life. Derived: the API carries two booleans. */
export type VoteStage = "locked" | "open" | "closed";

export function stageOf(vote: { started?: boolean; ended?: boolean }): VoteStage {
  if (vote.ended) return "closed";
  if (vote.started) return "open";
  return "locked";
}

export const STAGE_LABEL: Record<VoteStage, string> = {
  locked: "Not open yet",
  open: "Open",
  closed: "Closed",
};

/** The heading a stage gets when it groups a list. */
export const STAGE_HEADING: Record<VoteStage, string> = {
  locked: "Not open yet",
  open: "Open now",
  closed: "Closed",
};

export const KIND_TITLE: Record<VoteKind, string> = {
  Election: "Election",
  Pledge: "Pledge vote",
  Bidding: "Bidding",
};

/**
 * What one ballot decides, for the create form and empty states.
 *
 * "Option" rather than "candidate" for an election: plenty of them are yes /
 * no / abstain rather than a list of people, and a field labelled Name asks
 * for the wrong thing.
 */
export const KIND_SUBJECT: Record<VoteKind, string> = {
  Election: "option",
  Pledge: "pledge",
  Bidding: "rushee",
};

export const KIND_BLURB: Record<VoteKind, string> = {
  Election: "One choice from a list of options.",
  Pledge: "Board and blackball.",
  Bidding: "Bid or no bid on each rushee.",
};

/** The heading the names on a ballot are listed under. */
export const KIND_HEADING: Record<VoteKind, string> = {
  Election: "Options",
  Pledge: "Pledges",
  Bidding: "Rushees",
};

export const ABSTAIN = "Abstain";

export type PledgeRound = "board" | "blackball";

export const ROUND_TITLE: Record<PledgeRound, string> = {
  board: "Board",
  blackball: "Blackball",
};

/** The three answers a round accepts, in the order they are offered. */
export const ROUND_CHOICES: Record<PledgeRound, string[]> = {
  board: ["Continue", "Board", ABSTAIN],
  blackball: ["Continue", "Blackball", ABSTAIN],
};

/** The answer that objects, as opposed to the one that lets it proceed. */
export const ROUND_OBJECTION: Record<PledgeRound, string> = {
  board: "Board",
  blackball: "Blackball",
};

export const BIDDING_CHOICES = ["Bid", "No Bid", ABSTAIN];

export interface VotingAnchor {
  lat: number;
  lng: number;
  label: string | null;
  radiusMeters: number;
}

export interface VoteSummary {
  _id: string;
  type: VoteKind;
  title?: string | null;
  started: boolean;
  ended: boolean;
  createdAt?: string | null;
  voteCount: number;
  hasVoted: boolean;
  hasLocation: boolean;
  locationLabel?: string | null;
  proxyStatus?: ProxyStatus | null;
  pendingProxyCount: number;
  archived: boolean;
  endedAt?: string | null;
  purgeAt?: string | null;
}

export interface VoteDetail {
  _id: string;
  type: VoteKind;
  title?: string | null;
  started: boolean;
  ended: boolean;
  startedAt?: string | null;
  endTime?: string | null;
  totalVotes: number;
  voterListVerified: boolean;

  // Election
  options?: string[];
  hasVoted?: boolean;

  // Pledge
  pledges?: string[];
  round?: PledgeRound;
  votedPledges?: Record<string, boolean>;
  abstainedPledges?: Record<string, boolean>;

  // Bidding
  rushees?: string[];
  snapBids?: string[];
  votedRushees?: Record<string, boolean>;
  abstainedRushees?: Record<string, boolean>;

  votingLocation?: VotingAnchor | null;
  proxyStatus?: ProxyStatus | null;
  proxyReason?: string | null;
  proxyDecisionNote?: string | null;
}

export interface PledgeTally {
  continue: number;
  board?: number;
  blackball?: number;
  invalidBoard?: boolean;
  invalidBlackball?: boolean;
}

export interface BiddingTally {
  bid: number;
  noBid: number;
}

export interface VoteResults {
  type: VoteKind;
  title?: string | null;
  totalVotes: number;
  voterListVerified: boolean;
  options?: string[];
  results?: Record<string, number>;
  removedOptions?: string[];
  pledges?: string[];
  boardResults?: Record<string, PledgeTally>;
  blackballResults?: Record<string, PledgeTally>;
  rushees?: string[];
  snapBids?: string[];
  biddingResults?: Record<string, BiddingTally>;
}

export interface VoterRecord {
  clerkId: string;
  name: string;
  rollNo: string;
  status: "voted" | "proxy" | "no-ballot";
  isInvalidated: boolean;
  isProxy?: boolean;
}

export interface VoterListResponse {
  voterList: VoterRecord[];
  voteEnded: boolean;
  voterListVerified: boolean;
}

export interface ProxyRequest {
  clerkId: string;
  name: string;
  rollNo: string;
  reason?: string | null;
  status: ProxyStatus;
  requestedAt?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
}

export interface ProxyQueue {
  canDecide: boolean;
  own?: { status: ProxyStatus; reason?: string | null } | null;
  requests: ProxyRequest[];
}

export interface BallotPoint {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  proxy: boolean;
  distanceMeters?: number | null;
  flagged: boolean;
  choices: string[];
}

export interface BallotCluster {
  lat: number;
  lng: number;
  count: number;
  proxyCount: number;
  flaggedCount: number;
}

export interface VoteIntegrity {
  anchor: VotingAnchor | null;
  ballotCount: number;
  locatedCount: number;
  atAnchorCount: number;
  proxyCount: number;
  flaggedCount: number;
  clusters: BallotCluster[];
  points: BallotPoint[];
}

/** Where a member's ballot was cast from. Optional at every layer. */
export interface BallotLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** What a vote is called. An election carries its own title. */
export function displayTitle(vote: {
  type: VoteKind;
  title?: string | null;
}): string {
  return vote.title?.trim() || KIND_TITLE[vote.type];
}

/**
 * Whether this member's ballot is in, whatever kind of vote it is.
 *
 * A pledge or bidding ballot is submitted whole, so "voted" means every name
 * on it has an answer — a half-filled ballot is not a state the API can be
 * left in.
 */
export function hasSubmittedBallot(vote: VoteDetail): boolean {
  switch (vote.type) {
    case "Election":
      return !!vote.hasVoted;
    case "Pledge":
      return (
        !!vote.pledges?.length &&
        vote.pledges.every((p) => vote.votedPledges?.[p] === true)
      );
    case "Bidding":
      return (
        !!vote.rushees?.length &&
        vote.rushees.every((r) => vote.votedRushees?.[r] === true)
      );
  }
}

/** True when the early, proxy-only ballot is unlocked for this member. */
export function canCastProxy(vote: VoteDetail): boolean {
  return (
    stageOf(vote) === "locked" &&
    vote.proxyStatus === "approved" &&
    !hasSubmittedBallot(vote)
  );
}

/**
 * The colour and symbol for one answer.
 *
 * Kept in one place because the same words appear on three different ballots
 * and in the results: "Continue" has to mean the same green everywhere, or the
 * screens stop agreeing with each other.
 */
export type ChoiceTone = "positive" | "caution" | "negative" | "muted";

export function choiceTone(choice: string): ChoiceTone {
  switch (choice) {
    case "Continue":
    case "Bid":
      return "positive";
    case "Board":
      return "caution";
    case "Blackball":
    case "No Bid":
      return "negative";
    default:
      return "muted";
  }
}

/** "4:12" or "1:02:44". */
export function elapsedLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

/** Metres between two points, on a sphere. Good enough for a campus. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "200 m" / "1.2 km", the way a person would say it. */
export function metresLabel(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000;
    return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
  }
  return `${Math.round(metres)} m`;
}

/** "Deletes in 12 days" — what an archived row owes the reader. */
export function purgeLabel(purgeAt?: string | null): string | null {
  if (!purgeAt) return null;
  const when = new Date(purgeAt).getTime();
  if (!Number.isFinite(when) || when <= Date.now()) return null;
  const days = Math.floor((when - Date.now()) / 86_400_000);
  if (days < 1) return "Deletes today";
  return days === 1 ? "Deletes tomorrow" : `Deletes in ${days} days`;
}
