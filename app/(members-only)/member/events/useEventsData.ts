"use client";

import * as React from "react";

import {
  CHAPTER_SWATCH,
  swatchForId,
  swatchForKey,
  type CalendarSwatch,
} from "@/lib/calendarColors";

import { isPastEvent, resolveEventType, type Committee, type EventItem, type Me } from "./types";

/**
 * Everything the events screens load, and the questions they all ask of it.
 *
 * Shared because the overview and the two full lists are the same data with
 * different amounts of it on screen: one copy of the loading, one copy of the
 * permission rules, and no chance of the list and the calendar disagreeing
 * about whose event something is.
 */
export function useEventsData() {
  const [me, setMe] = React.useState<Me | null>(null);
  const [events, setEvents] = React.useState<EventItem[]>([]);
  const [committees, setCommittees] = React.useState<Committee[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const response = await fetch("/api/events?includePast=true");
    if (!response.ok) throw new Error("Events could not be loaded.");
    setEvents(await response.json());
  }, []);

  React.useEffect(() => {
    let active = true;

    fetch("/api/members/me")
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setMe({
          role: data.role,
          status: data.status,
          memberId: data.memberId,
          isCommitteeHead: data.isCommitteeHead,
          isECouncil: data.isECouncil,
        });
      })
      .catch(() => {
        if (active) setMe(null);
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!me) return;
    let active = true;

    Promise.all([
      fetch("/api/committees")
        .then((response) => (response.ok ? response.json() : []))
        .then((data) => {
          if (active) setCommittees(data);
        }),
      reload(),
    ])
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [me, reload]);

  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const memberCommitteeIds = React.useMemo(
    () =>
      committees
        .filter((committee) => {
          const headId =
            typeof committee.committeeHeadId === "string"
              ? committee.committeeHeadId
              : committee.committeeHeadId?._id;
          const memberIds =
            committee.committeeMembers?.map((member) =>
              typeof member === "string" ? member : member._id || ""
            ) ?? [];
          return headId === me?.memberId || memberIds.includes(me?.memberId || "");
        })
        .map((committee) => committee._id),
    [committees, me?.memberId]
  );

  const committeeNames = React.useMemo(
    () => new Map(committees.map((committee) => [committee._id, committee.name])),
    [committees]
  );

  /**
   * The colour an event is drawn in: its committee's, or the chapter's.
   *
   * The same three-step fallback the iOS app uses — stored key, then a hash of
   * the committee id for one the server has not coloured yet — so a committee
   * looks the same in both places.
   */
  const swatchFor = React.useCallback(
    (event: EventItem): CalendarSwatch => {
      if (resolveEventType(event) === "chapter" || !event.committeeId) {
        return CHAPTER_SWATCH;
      }
      const committee = committees.find((entry) => entry._id === event.committeeId);
      return swatchForKey(committee?.color) ?? swatchForId(event.committeeId);
    },
    [committees]
  );

  const committeeLabel = React.useCallback(
    (event: EventItem) =>
      resolveEventType(event) === "chapter" || !event.committeeId
        ? "Chapter"
        : committeeNames.get(event.committeeId) || "Committee",
    [committeeNames]
  );

  /** Chapter-wide, or run by a committee this member is on. */
  const isMine = React.useCallback(
    (event: EventItem) =>
      resolveEventType(event) === "chapter" ||
      (event.committeeId ? memberCommitteeIds.includes(event.committeeId) : false),
    [memberCommitteeIds]
  );

  const canManage = React.useCallback(
    (event: EventItem) => {
      if (isAdmin || me?.isECouncil) return true;
      if (!event.committeeId) return false;
      const committee = committees.find((entry) => entry._id === event.committeeId);
      const headId =
        typeof committee?.committeeHeadId === "string"
          ? committee?.committeeHeadId
          : committee?.committeeHeadId?._id;
      return headId === me?.memberId;
    },
    [isAdmin, me?.isECouncil, me?.memberId, committees]
  );

  const canForceSync = !!me && (isAdmin || me.isCommitteeHead);

  const fetchDetails = React.useCallback(async (eventId: string) => {
    const response = await fetch(`/api/events/${eventId}`);
    return response.ok ? await response.json() : null;
  }, []);

  /**
   * Moves an event along. Returns the completed event's details, because
   * ending one is immediately followed by wanting to see who turned up.
   */
  const updateStatus = React.useCallback(
    async (
      eventId: string,
      status: string,
      applyToSeries: "single" | "series" = "single"
    ) => {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, applyToSeries }),
      });
      if (!response.ok) return null;

      await reload();
      return status === "completed" ? await fetchDetails(eventId) : null;
    },
    [reload, fetchDetails]
  );

  /** Upcoming first, and only the past when it is asked for. */
  const sortedFor = React.useCallback(
    (scope: "mine" | "others", includePast: boolean) => {
      const now = new Date();
      return events
        .filter((event) => (includePast ? true : !isPastEvent(event, now)))
        .filter((event) => (scope === "mine" ? isMine(event) : !isMine(event)))
        .sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
    },
    [events, isMine]
  );

  return {
    me,
    events,
    committees,
    loading,
    error,
    reload,
    isAdmin,
    canForceSync,
    committeeLabel,
    swatchFor,
    isMine,
    canManage,
    updateStatus,
    fetchDetails,
    sortedFor,
  };
}
