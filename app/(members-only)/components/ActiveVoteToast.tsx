"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/sonner";

/**
 * A vote is open and this member hasn't cast a ballot.
 *
 * Chapter votes are the one thing on this site with a window that closes. Dues
 * can be paid tomorrow and minutes can be read next week, but a vote runs for a
 * few minutes in a room and then it is over — so it is the one thing worth
 * putting *over* the dashboard rather than in it. The iOS app raises a floating
 * banner for exactly this; on the web that is a toast.
 *
 * Polled rather than pushed: there is no live channel to the chapter server,
 * and a vote that opens while somebody is reading their dues has to reach them
 * inside the few minutes it runs.
 */

const POLL_MS = 20_000;

interface OpenVote {
  _id: string;
  type: string;
  title?: string | null;
  started: boolean;
  ended: boolean;
  hasVoted: boolean;
}

export function ActiveVoteToast() {
  const router = useRouter();
  /**
   * Votes already announced this session, so a poll every twenty seconds does
   * not raise the same toast three times a minute. Not persisted: a vote is
   * open for minutes, and remembering a dismissal past a reload would mean
   * remembering it past the vote.
   */
  const announced = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/api/vote/manage");
        if (!response.ok) return;
        const { votes } = (await response.json()) as { votes: OpenVote[] };
        const open = (votes ?? []).find(
          (vote) => vote.started && !vote.ended && !vote.hasVoted
        );
        if (cancelled || !open || announced.current.has(open._id)) return;

        announced.current.add(open._id);
        toast("Voting is open", {
          description: open.title?.trim() || `${open.type} vote`,
          duration: Infinity,
          action: {
            label: "Vote",
            onClick: () => router.push("/member/vote"),
          },
        });
      } catch {
        // Quiet on failure. A dashboard must not sprout an error because a
        // background poll for something that usually doesn't exist failed.
      }
    };

    void check();
    const timer = setInterval(check, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
