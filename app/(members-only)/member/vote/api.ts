import type {
  BallotLocation,
  PledgeRound,
  ProxyQueue,
  VoteDetail,
  VoteIntegrity,
  VoteKind,
  VoteResults,
  VoteSummary,
  VoterListResponse,
  VotingAnchor,
} from "./types";
import { ABSTAIN } from "./types";

/**
 * Every call the voting page makes, in one place.
 *
 * Thin on purpose: these are the same `/api/vote*` routes the iOS app uses,
 * and they re-check the caller's position server-side. The page decides what
 * to *offer*; this decides nothing.
 */

/** The API's own message when it has one, rather than a bare status code. */
async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json().catch(() => ({}))) as T;
}

const json = (body: unknown) => JSON.stringify(body);

// MARK: - Reading

/**
 * Every vote the chapter has. Open to any member: this is also how somebody
 * finds a vote they have been approved to proxy on.
 */
export async function listVotes(): Promise<VoteSummary[]> {
  const data = await request<{ votes: VoteSummary[] }>("/api/vote/manage");
  return data.votes ?? [];
}

/** One vote as the member casting it sees it. */
export function voteDetail(voteId: string): Promise<VoteDetail> {
  return request<VoteDetail>(`/api/vote?voteId=${encodeURIComponent(voteId)}`);
}

/** The tally. Vote officers only. */
export function voteResults(voteId: string): Promise<VoteResults> {
  return request<VoteResults>(
    `/api/vote/manage?voteId=${encodeURIComponent(voteId)}`
  );
}

export function voterList(voteId: string): Promise<VoterListResponse> {
  return request<VoterListResponse>(
    `/api/vote/ballots?voteId=${encodeURIComponent(voteId)}`
  );
}

export function proxyQueue(voteId: string): Promise<ProxyQueue> {
  return request<ProxyQueue>(
    `/api/vote/proxy?voteId=${encodeURIComponent(voteId)}`
  );
}

export function voteIntegrity(voteId: string): Promise<VoteIntegrity> {
  return request<VoteIntegrity>(
    `/api/vote/location?voteId=${encodeURIComponent(voteId)}`
  );
}

// MARK: - Casting

export function castElection(
  voteId: string,
  choice: string,
  proxy: boolean,
  location: BallotLocation | null
): Promise<void> {
  return request("/api/vote", {
    method: "POST",
    body: json({ voteId, choice, proxy, location }),
  });
}

/**
 * A whole pledge ballot: every pledge, both rounds, in one request.
 *
 * Never split. The API inserts the lot atomically and refuses a second
 * submission, so a half-sent ballot would lock the member out of the half they
 * hadn't sent.
 */
export function castPledge(
  voteId: string,
  pledges: string[],
  selections: Record<string, Partial<Record<PledgeRound, string>>>,
  proxy: boolean,
  location: BallotLocation | null
): Promise<void> {
  const ballot = pledges.map((pledge) => ({
    pledge,
    boardChoice: selections[pledge]?.board ?? ABSTAIN,
    blackballChoice: selections[pledge]?.blackball ?? ABSTAIN,
  }));
  return request("/api/vote", {
    method: "POST",
    body: json({ voteId, ballot, proxy, location }),
  });
}

export function castBidding(
  voteId: string,
  rushees: string[],
  selections: Record<string, string>,
  proxy: boolean,
  location: BallotLocation | null
): Promise<void> {
  const ballot = rushees.map((rushee) => ({
    rushee,
    choice: selections[rushee] ?? ABSTAIN,
  }));
  return request("/api/vote", {
    method: "POST",
    body: json({ voteId, ballot, proxy, location }),
  });
}

// MARK: - Proxy

export function requestProxy(voteId: string, reason: string): Promise<void> {
  return request("/api/vote/proxy", {
    method: "POST",
    body: json({ voteId, reason }),
  });
}

/** Takes back a request nobody has decided yet. */
export function withdrawProxy(voteId: string): Promise<void> {
  return request(`/api/vote/proxy?voteId=${encodeURIComponent(voteId)}`, {
    method: "DELETE",
  });
}

export function decideProxy(
  voteId: string,
  clerkId: string,
  approved: boolean
): Promise<void> {
  return request("/api/vote/proxy", {
    method: "PATCH",
    body: json({ voteId, clerkId, decision: approved ? "approved" : "denied" }),
  });
}

// MARK: - Running a vote

export async function createVote(
  type: VoteKind,
  title: string | null,
  names: string[],
  anchor: VotingAnchor | null
): Promise<string> {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  const data = await request<{ voteId: string }>("/api/vote/manage", {
    method: "POST",
    body: json({
      type,
      title: type === "Election" ? title?.trim() || undefined : undefined,
      options: type === "Election" ? cleaned : undefined,
      pledges: type === "Pledge" ? cleaned : undefined,
      rushees: type === "Bidding" ? cleaned : undefined,
      votingLocation: anchor ?? undefined,
    }),
  });
  return data.voteId;
}

export function startVote(voteId: string): Promise<void> {
  return request("/api/vote/manage", {
    method: "PATCH",
    body: json({ action: "start", voteId }),
  });
}

/** Ends the vote, either now or after a countdown the room can watch. */
export function endVote(voteId: string, countdownSeconds: number): Promise<void> {
  return request("/api/vote/manage", {
    method: "PATCH",
    body: json({ action: "end", voteId, countdown: Math.max(0, countdownSeconds) }),
  });
}

export function setAnchor(voteId: string, anchor: VotingAnchor): Promise<void> {
  return request("/api/vote/manage", {
    method: "PATCH",
    body: json({ action: "setLocation", voteId, votingLocation: anchor }),
  });
}

/** Moves a finished vote out of the way early, or puts it back. */
export function setArchived(voteId: string, archived: boolean): Promise<void> {
  return request("/api/vote/manage", {
    method: "PATCH",
    body: json({ action: archived ? "archive" : "unarchive", voteId }),
  });
}

export function deleteVote(voteId: string): Promise<void> {
  return request(`/api/vote/manage?voteId=${encodeURIComponent(voteId)}`, {
    method: "DELETE",
  });
}

export function addOption(voteId: string, option: string): Promise<void> {
  return request("/api/vote/options", {
    method: "POST",
    body: json({ voteId, option }),
  });
}

export function removeOption(voteId: string, option: string): Promise<void> {
  return request(
    `/api/vote/options?voteId=${encodeURIComponent(voteId)}&option=${encodeURIComponent(option)}`,
    { method: "DELETE" }
  );
}

export function toggleSnapBid(voteId: string, rushee: string): Promise<void> {
  return request("/api/vote/snap-bid", {
    method: "POST",
    body: json({ voteId, rushee }),
  });
}

// MARK: - Ballot review

export function invalidateBallot(voteId: string, clerkId: string): Promise<void> {
  return request("/api/vote/ballots", {
    method: "POST",
    body: json({ voteId, clerkId }),
  });
}

export function restoreBallot(voteId: string, clerkId: string): Promise<void> {
  return request(
    `/api/vote/ballots?voteId=${encodeURIComponent(voteId)}&clerkId=${encodeURIComponent(clerkId)}`,
    { method: "DELETE" }
  );
}

/**
 * Signs off the roll. One-way: the server refuses any further change to the
 * ballots afterwards, which is the point of it.
 */
export function verifyVoterList(voteId: string): Promise<void> {
  return request("/api/vote/ballots", {
    method: "PUT",
    body: json({ voteId }),
  });
}

// MARK: - Pledge cons

export function pledgeCons(): Promise<{
  pledges: string[];
  pledgeValidCons: Record<string, boolean>;
}> {
  return request("/api/vote/pledge-cons");
}

export function savePledgeCons(
  pledgeValidCons: Record<string, boolean>
): Promise<void> {
  return request("/api/vote/pledge-cons", {
    method: "POST",
    body: json({ pledgeValidCons }),
  });
}

// MARK: - Location

/**
 * The browser's position, captured before a ballot is submitted.
 *
 * Optional by design. A member who declines the prompt still votes; their
 * ballot simply doesn't appear on the integrity map, which is a smaller wrong
 * than refusing to count it.
 */
export function captureLocation(): Promise<BallotLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}
