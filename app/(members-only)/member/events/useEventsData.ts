"use client";

import * as React from "react";

import {
  CHAPTER_SWATCH,
  swatchForId,
  swatchForKey,
  type CalendarSwatch,
} from "@/lib/calendarColors";

import { patchEventStatus } from "./eventActions";
import { isPastEvent, resolveEventType, type Committee, type EventItem, type Me } from "./types";

/**
 * Everything the events screens load, and the questions they all ask of it.
 *
 * Shared because the overview and the two full lists are the same data with
 * different amounts of it on screen: one copy of the loading, one copy of the
 * permission rules, and no chance of the list and the calendar disagreeing
 * about whose event something is.
 */
export function useEventViewer(enabled = true) {
  const [me, setMe] = React.useState<Me | null>(null);
  const [committees, setCommittees] = React.useState<Committee[]>([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
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
        if (active) {
          setMe(null);
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled || !me) return;
    let active = true;

    fetch("/api/committees")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (active) setCommittees(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [enabled, me]);

  const isAdmin = me?.role === "admin" || me?.role === "superadmin";
  const isOfficer = isAdmin || !!me?.isECouncil;

  const headCommitteeIds = React.useMemo(
    () =>
      committees
        .filter((committee) => {
          const headId =
            typeof committee.committeeHeadId === "string"
              ? committee.committeeHeadId
              : committee.committeeHeadId?._id;
          return !!me?.memberId && headId === me.memberId;
        })
        .map((committee) => committee._id),
    [committees, me?.memberId]
  );

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

  /**
   * Whose calendar this viewer may put something on. Officers get the chapter
   * and every committee; anyone else only the committees they head or sit on,
   * which is the rule the create route enforces and what the iOS "+" offers.
   */
  const schedulableCommittees = React.useMemo(
    () =>
      isOfficer
        ? committees
        : committees.filter((committee) => memberCommitteeIds.includes(committee._id)),
    [isOfficer, committees, memberCommitteeIds]
  );

  /**
   * Who gets a "New event" button. Matches the phone: officers and committee
   * heads. A plain committee member could be let through by the server but is
   * not offered it, so the two apps do not disagree about who can schedule.
   */
  const canCreate = isOfficer || headCommitteeIds.length > 0;

  return {
    me,
    committees,
    ready,
    isAdmin,
    isOfficer,
    memberCommitteeIds,
    headCommitteeIds,
    schedulableCommittees,
    canCreate,
  };
}

export type EventViewer = ReturnType<typeof useEventViewer>;

export function useEventsData() {
  const viewer = useEventViewer();
  const { me, committees, memberCommitteeIds, isAdmin } = viewer;
  const [events, setEvents] = React.useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const response = await fetch("/api/events?includePast=true");
    if (!response.ok) throw new Error("Events could not be loaded.");
    setEvents(await response.json());
  }, []);

  React.useEffect(() => {
    if (!me) return;
    let active = true;

    reload()
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [me, reload]);

  const loading = !viewer.ready || (!!me && eventsLoading);

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

  /**
   * The server's answer, not a local re-derivation of it: the list arrives
   * with `canManage` on every event.
   */
  const canManage = React.useCallback((event: EventItem) => !!event.canManage, []);

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
      if (!(await patchEventStatus(eventId, status, applyToSeries))) return null;

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
    viewer,
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
