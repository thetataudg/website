"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { RedirectToSignIn } from "@clerk/nextjs";
import axios from "axios";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTimes,
  faTriangleExclamation,
  faHourglass,
  faNoteSticky,
  faCheckToSlot,
  faCalendar,
  faGem,
  faUsersCog,
} from "@fortawesome/free-solid-svg-icons";
import LoadingState, { LoadingSpinner } from "../components/LoadingState";
import { useRouter } from "next/navigation";
import ConnectWithDiscordButton from "@/components/ConnectWithDiscordButton";

type LockdownInfo = {
  active: boolean;
  reason: string;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
};

type DashboardEvent = {
  _id: string;
  name: string;
  committeeId?: string | null;
  startTime: string;
  endTime: string;
  location?: string;
  status: string;
};

type DashboardCommittee = {
  _id: string;
  name: string;
};

type GemRequirementKey =
  | "generalConference"
  | "committeeMeetings"
  | "brotherhood"
  | "service"
  | "professionalism"
  | "rush"
  | "fso"
  | "lockIn"
  | "gpa";

type GemMemberSnapshot = {
  memberId: string;
  totalSatisfied: number;
  hasCompletedGem: boolean;
  satisfiedRequirements: GemRequirementKey[];
  gem: {
    rush: {
      total: number;
      required: number;
    };
    gpa: {
      value: number | null;
      threshold: number;
      satisfied: boolean;
    };
  };
};

type GemStatusResponse = {
  members: GemMemberSnapshot[];
};

const GEM_REQUIREMENTS: GemRequirementKey[] = [
  "generalConference",
  "committeeMeetings",
  "brotherhood",
  "service",
  "professionalism",
  "rush",
  "fso",
  "lockIn",
  "gpa",
];

const GOOGLE_CALENDAR_EMBED_SRC =
  "https://calendar.google.com/calendar/embed?height=600&wkst=2&ctz=America%2FPhoenix&showPrint=0&title=Theta%20Tau%20Delta%20Gamma&src=Y18yMzNkMGFlNjA2NTg2YTcyNjg0MDMxMzg5MTZkYmMxYWUzZjk5MjNiZWU1MzBhY2NhNWIzOWRkYmIxZGM1MDU1QGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20&src=Y180NThhYjlhNGIzOTRjOTA1MjI3NDBiZmNlOTRkNmFlZTk2NzI2MTBkMTI3NzU1YzAyN2U0OWFjMmJhZDMwOWNjQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20&color=%238b1b23&color=%23e1b21e";

export default function Dashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const [loadingUserData, setLoadingUserData] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const qrForegroundColor = "000000";
  const qrBackgroundColor = "fffaf4";
  const [checkInCode, setCheckInCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(0);
  const [codeError, setCodeError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lockdownState, setLockdownState] = useState<LockdownInfo | null>(null);
  const [lockdownLoading, setLockdownLoading] = useState(true);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [homePanelsLoading, setHomePanelsLoading] = useState(false);
  const [homePanelsError, setHomePanelsError] = useState<string | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<DashboardEvent[]>([]);
  const [committeeMeetings, setCommitteeMeetings] = useState<DashboardEvent[]>(
    []
  );
  const [committeeNames, setCommitteeNames] = useState<Record<string, string>>(
    {}
  );
  const [gemSnapshot, setGemSnapshot] = useState<GemMemberSnapshot | null>(null);
  const walletUrls = {
    google: "#",
    apple: "#",
  };

  const handleAddToWallet =
    (provider: keyof typeof walletUrls) => () => {
      window.open(walletUrls[provider], "_blank", "noopener");
    };

  const needsDiscordLink =
    !loadingUserData &&
    Boolean(userData?.memberId) &&
    !userData?.discordId &&
    !userData?.pending;

  useEffect(() => {
    setShowLinkModal(needsDiscordLink);
  }, [needsDiscordLink]);

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await axios.get("/api/members/me");
        const data = response.data;

        console.log("API /api/members/me response:", data);

        const isPending = Boolean(data.pending);
        const hasProfile = Boolean(data.memberId);
        const needsProfileReview = data.needsProfileReview ?? false;
        const needsPermissionReview = data.needsPermissionReview ?? false;
        setUserData({
          userHasProfile: hasProfile,
          pending: isPending,
          pendingStatus: data.pendingStatus,
          pendingDetails: isPending
            ? {
                pendingId: data.pendingId,
                submittedAt: data.pendingSubmittedAt,
                reviewedAt: data.pendingReviewedAt,
                reviewComments: data.pendingReviewComments,
              }
            : undefined,
          needsProfileReview,
          needsPermissionReview,
          type: isPending ? "Pending" : data.status, // Use the real status from API
          isECouncil: Boolean(data.isECouncil),
          isAdmin: data.role === "admin" || data.role === "superadmin",
          rollNo: data.rollNo,
          memberId: data.memberId,
          discordId: data.discordId || null,
        });

      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setNeedsOnboarding(true);
          router.replace("/member/onboard");
        } else {
          console.error("Error fetching user data:", error);
        }
        setUserData(null);
      } finally {
        setLoadingUserData(false);
      }
    }

    if (isSignedIn) fetchUserData();
  }, [isSignedIn, router]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchState = async () => {
      try {
        const res = await fetch("/api/lockdown", { signal: controller.signal });
        if (!res.ok) throw new Error("Unable to load lockdown status");
        const payload = await res.json();
        setLockdownState({
          active: Boolean(payload.active),
          reason: payload.reason || "",
          durationMinutes: Number(payload.durationMinutes || 0),
          startedAt: payload.startedAt || null,
          endsAt: payload.endsAt || null,
        });
      } catch (err) {
        console.error("Failed to load lockdown state", err);
      } finally {
        setLockdownLoading(false);
      }
    };
    fetchState();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (needsOnboarding) {
      router.replace("/member/onboard");
    }
  }, [needsOnboarding, router]);

  useEffect(() => {
    if (lockdownLoading || !lockdownState?.active || !userData) return;
    if (userData.isAdmin || userData.isECouncil) return;
    router.replace("/member/lockdown");
  }, [lockdownLoading, lockdownState, userData, router]);

  useEffect(() => {
    if (!showQr || !userData?.memberId) {
      setCheckInCode("");
      setCodeExpiresAt(null);
      setCodeError(null);
      return;
    }

    let mounted = true;
    const fetchCode = async () => {
      setQrLoading(true);
      setCheckInCode("");
      setCodeError(null);
      try {
        const res = await fetch("/api/checkin-code", { credentials: "include" });
        if (!res.ok) {
          throw new Error("Unable to generate code");
        }
        const payload = await res.json();
        if (!mounted) return;
        setCheckInCode(payload.code);
        setCodeExpiresAt(payload.expiresAt);
        setCodeError(null);
        const delay = Math.max(payload.expiresAt - Date.now() - 500, 0);
        refreshTimeoutRef.current && clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = setTimeout(fetchCode, delay);
      } catch (err: any) {
        if (!mounted) return;
        setCodeError(err?.message || "Failed to refresh check-in code");
      } finally {
        if (mounted) {
          setQrLoading(false);
        }
      }
    };

    fetchCode();

    return () => {
      mounted = false;
      refreshTimeoutRef.current && clearTimeout(refreshTimeoutRef.current);
    };
  }, [showQr, userData?.memberId]);

  useEffect(() => {
    if (!codeExpiresAt) {
      setSecondsUntilRefresh(0);
      return;
    }
    const update = () => {
      setSecondsUntilRefresh((prev) => {
        const seconds = Math.max(
          0,
          Math.ceil((codeExpiresAt - Date.now()) / 1000)
        );
        return seconds;
      });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [codeExpiresAt]);

  useEffect(() => {
    if (!showCalendarModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCalendarModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCalendarModal]);

  useEffect(() => {
    if (!userData?.memberId || !userData?.userHasProfile) return;
    let cancelled = false;

    const loadHomePanels = async () => {
      setHomePanelsLoading(true);
      setHomePanelsError(null);
      try {
        const committeeUrl = `/api/committees?memberId=${encodeURIComponent(
          userData.memberId
        )}`;

        const [eventsRes, committeesRes, gemRes] = await Promise.all([
          fetch("/api/events?status=scheduled,ongoing"),
          fetch(committeeUrl),
          fetch("/api/gem/status"),
        ]);

        if (!eventsRes.ok) {
          throw new Error("Unable to load upcoming events.");
        }

        const events = (await eventsRes.json()) as DashboardEvent[];
        const committees = committeesRes.ok
          ? ((await committeesRes.json()) as DashboardCommittee[])
          : [];

        const nameLookup = committees.reduce<Record<string, string>>(
          (lookup, committee) => {
            if (committee?._id && committee?.name) {
              lookup[committee._id] = committee.name;
            }
            return lookup;
          },
          {}
        );
        const committeeIdSet = new Set(Object.keys(nameLookup));

        const now = Date.now();
        const sortedUpcoming = events
          .filter((event) => {
            const endTime = new Date(event.endTime).getTime();
            return (
              Number.isFinite(endTime) &&
              endTime >= now &&
              event.status !== "cancelled"
            );
          })
          .sort(
            (a, b) =>
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          );

        const chapterEvents = sortedUpcoming
          .filter((event) => !event.committeeId)
          .slice(0, 4);

        const myCommitteeEvents = sortedUpcoming
          .filter((event) => {
            const committeeId = event.committeeId || "";
            return Boolean(committeeId) && committeeIdSet.has(committeeId);
          })
          .slice(0, 4);

        let memberGemSnapshot: GemMemberSnapshot | null = null;
        if (gemRes.ok) {
          const gemPayload = (await gemRes.json()) as GemStatusResponse;
          memberGemSnapshot =
            gemPayload.members.find((member) => member.memberId === userData.memberId) ||
            gemPayload.members[0] ||
            null;
        }

        if (cancelled) return;
        setCommitteeNames(nameLookup);
        setUpcomingEvents(chapterEvents);
        setCommitteeMeetings(myCommitteeEvents);
        setGemSnapshot(memberGemSnapshot);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load homepage panels:", error);
        setHomePanelsError("We couldn't load homepage cards right now.");
        setUpcomingEvents([]);
        setCommitteeMeetings([]);
      } finally {
        if (!cancelled) {
          setHomePanelsLoading(false);
        }
      }
    };

    loadHomePanels();
    return () => {
      cancelled = true;
    };
  }, [
    userData?.memberId,
    userData?.userHasProfile,
    userData?.isAdmin,
    userData?.isECouncil,
  ]);

  if (!isLoaded || loadingUserData) {
    return <LoadingState message="Loading dashboard..." />;
  }

  if (needsOnboarding) {
    return (
      <LoadingState message="Redirecting to the onboarding form..." />
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div
          className="alert alert-danger d-flex align-items-center mt-5"
          role="alert"
        >
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>You must be logged in to use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }


  if (!userData || !userData.type) {
    // All accesses are false for unapproved users
    const privileges = [
      { label: "Edit Profile", access: false },
      { label: "Directory", access: false },
      { label: "Minutes", access: false },
      { label: "Vote", access: false },
      { label: "Admin Voting", access: false },
      { label: "Events", access: false },
      { label: "Admin Users", access: false },
    ];

    return (
      <div className="member-dashboard">
        <section className="member-hero bento-card">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <FontAwesomeIcon icon={faUsersCog} />
              Delta Gamma Member Hub
            </div>
            {user ? (
              <h1 className="hero-title">Welcome, {user.firstName}</h1>
            ) : (
              <h2 className="hero-title">Welcome, please enter your name</h2>
            )}
            <p className="hero-subtitle">
              Your membership access is still being verified.
            </p>
            <div className="hero-tags">
              <span className="tt-tag">Status: Pending</span>
              <span className="tt-tag">Profile review in progress</span>
            </div>
          </div>
          <div className="hero-spotlight bento-card">
            <div className="spotlight-icon">
              <FontAwesomeIcon icon={faHourglass} />
            </div>
            <div>
              <div className="spotlight-title">Awaiting approval</div>
              <div className="spotlight-meta">
                An officer will confirm your profile shortly.
              </div>
            </div>
          </div>
        </section>

        <section className="bento-card status-bar">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </span>
            Status updates
          </div>
          <div className="status-grid">
            <div className="status-card info">
              <FontAwesomeIcon icon={faHourglass} />
              <div>
                Your profile is not yet approved. Please contact an officer if
                you believe this is an error.
              </div>
            </div>
          </div>
        </section>

        <div className="bento-grid">
          <section className="bento-card bento-permissions">
            <div className="bento-title">
              <span className="icon-pill">
                <FontAwesomeIcon icon={faCheck} />
              </span>
              My permissions
            </div>
            <div className="perm-list">
              {privileges.map((priv, index) => (
                <div className="perm-item" key={index}>
                  <span>{priv.label}</span>
                  <FontAwesomeIcon
                    icon={priv.access ? faCheck : faTimes}
                    className={`status-icon ${
                      priv.access ? "text-success" : "text-danger"
                    }`}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const {
    userHasProfile,
    type,
    isECouncil,
    isAdmin,
    needsPermissionReview,
    needsProfileReview,
  } = userData;

  const userTypeDetails = [
    isAdmin && "Admin",
    isECouncil && "E-Council",
    needsPermissionReview && "access pending",
  ]
    .filter(Boolean)
    .join(", ");

  const eventDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const eventTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  });
  const formatEventDate = (value: string) =>
    eventDateFormatter.format(new Date(value));
  const formatEventTime = (value: string) =>
    eventTimeFormatter.format(new Date(value));

  const gemCompletionCount = gemSnapshot?.totalSatisfied || 0;
  const gemCompletionPercent = Math.round(
    (gemCompletionCount / GEM_REQUIREMENTS.length) * 100
  );

  const statusUpdates: { type: "alert" | "info" | "success"; icon: any; text: string }[] = [];
  if (!userHasProfile) {
    statusUpdates.push({
      type: "alert",
      icon: faTriangleExclamation,
      text: "You do not have access to this tool yet. Please contact an admin if you believe this is an error.",
    });
  }
  if (needsPermissionReview) {
    statusUpdates.push({
      type: "info",
      icon: faHourglass,
      text: "Since you marked yourself as E-Council, your extended permissions are being verified.",
    });
  }
  if (needsProfileReview && !needsPermissionReview) {
    statusUpdates.push({
      type: "info",
      icon: faHourglass,
      text: "Your profile changes are awaiting review.",
    });
  }
  return (
    <div className="member-dashboard">
      <section className="member-hero bento-card">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <FontAwesomeIcon icon={faUsersCog} />
            Delta Gamma Member Hub
          </div>
          {user ? (
            <h1 className="hero-title">Welcome, {user.firstName}</h1>
          ) : (
            <h2 className="hero-title">Welcome, please enter your name</h2>
          )}
          <div className="hero-tags">
            <span className="tt-tag">Status: {type}</span>
            {userTypeDetails && <span className="tt-tag">{userTypeDetails}</span>}
          </div>
        </div>
        <div className="hero-spotlight bento-card">
          {userData?.memberId ? (
            <button
              className="tt-btn tt-btn-primary tt-btn-compact"
              onClick={() => setShowQr(true)}
              type="button"
            >
              <FontAwesomeIcon icon={faCheckToSlot} />
              My Check-In Code
            </button>
          ) : (
            <div className="spotlight-meta">
              Check-in code unlocks after your profile is verified.
            </div>
          )}
        </div>
      </section>

      {statusUpdates.length > 0 && (
        <section className="bento-card status-bar">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faNoteSticky} />
            </span>
            Status updates
          </div>
          <div className="status-grid">
            {statusUpdates.map((update, index) => (
              <div className={`status-card ${update.type}`} key={index}>
                <FontAwesomeIcon icon={update.icon} />
                <div>{update.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="bento-grid member-home-grid">
        <section className="bento-card home-panel home-panel--events">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faCalendar} />
            </span>
            Upcoming chapter events
          </div>
          <p className="home-panel__subtitle">
            Chapter-wide events you can plan for this week.
          </p>
          {homePanelsError && (
            <div className="home-panel__error">{homePanelsError}</div>
          )}
          {homePanelsLoading ? (
            <div className="home-panel__loading">
              <LoadingSpinner />
              <span>Loading events...</span>
            </div>
          ) : upcomingEvents.length > 0 ? (
            <div className="home-feed-list">
              {upcomingEvents.map((event) => (
                <article key={event._id} className="home-feed-item">
                  <div className="home-feed-item__date">
                    {formatEventDate(event.startTime)}
                  </div>
                  <div className="home-feed-item__content">
                    <h3>{event.name}</h3>
                    <div className="home-feed-item__meta">
                      <span>
                        {formatEventTime(event.startTime)} -{" "}
                        {formatEventTime(event.endTime)}
                      </span>
                      {event.location ? <span>{event.location}</span> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="home-panel__empty">
              No chapter events are scheduled right now.
            </p>
          )}
          <Link href="/member/events" className="tt-btn tt-btn-outline tt-btn-compact">
            View all events
          </Link>
        </section>

        <section className="bento-card home-panel home-panel--committees">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faUsersCog} />
            </span>
            Committee meetings
          </div>
          <p className="home-panel__subtitle">
            Meetings for committees you are currently assigned to.
          </p>
          {homePanelsLoading ? (
            <div className="home-panel__loading">
              <LoadingSpinner />
              <span>Loading committee meetings...</span>
            </div>
          ) : committeeMeetings.length > 0 ? (
            <div className="home-feed-list">
              {committeeMeetings.map((event) => (
                <article key={event._id} className="home-feed-item">
                  <div className="home-feed-item__date">
                    {formatEventDate(event.startTime)}
                  </div>
                  <div className="home-feed-item__content">
                    <h3>{event.name}</h3>
                    <div className="home-feed-item__meta">
                      <span>
                        {event.committeeId
                          ? committeeNames[event.committeeId] || "Committee"
                          : "Committee"}
                      </span>
                      <span>
                        {formatEventTime(event.startTime)} -{" "}
                        {formatEventTime(event.endTime)}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="home-panel__empty">
              No committee meetings are scheduled yet.
            </p>
          )}
          <Link
            href="/member/events"
            className="tt-btn tt-btn-outline tt-btn-compact"
          >
            Open events page
          </Link>
        </section>

        <Link href="/member/gem" className="bento-card home-gem-card">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faGem} />
            </span>
            GEM progress
          </div>
          {homePanelsLoading && !gemSnapshot ? (
            <div className="home-panel__loading">
              <LoadingSpinner />
              <span>Loading GEM status...</span>
            </div>
          ) : gemSnapshot ? (
            <>
              <div className="home-gem-card__stats">
                <strong>
                  {gemCompletionCount}/{GEM_REQUIREMENTS.length}
                </strong>
                <span>{gemSnapshot.hasCompletedGem ? "On track" : "Needs attention"}</span>
              </div>
              <div className="home-gem-card__progress" aria-hidden="true">
                <span style={{ width: `${Math.max(gemCompletionPercent, 8)}%` }} />
              </div>
              <div className="home-gem-card__detail">
                <span>Needed to meet GEM: 5/9</span>
              </div>
            </>
          ) : (
            <p className="home-panel__empty">GEM status unavailable.</p>
          )}
        </Link>

        <section className="bento-card home-calendar-card">
          <div className="bento-title">
            <span className="icon-pill">
              <FontAwesomeIcon icon={faCalendar} />
            </span>
            Chapter calendar
          </div>
          <p className="home-panel__subtitle">
            Open the shared Google calendar in a themed popup without leaving this page.
          </p>
          <button
            type="button"
            className="tt-btn tt-btn-primary"
            onClick={() => setShowCalendarModal(true)}
          >
            Open calendar
          </button>
        </section>
      </div>

      {showQr && userData?.memberId && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content qr-modal">
              <div className="modal-header">
                <h5 className="modal-title">My Check-In Code</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowQr(false)}
                />
              </div>
              <div className="modal-body text-center">
                {qrLoading ? (
                  <div className="qr-loading">
                    <LoadingSpinner size="2x" />
                    <span className="text-muted">Loading QR code...</span>
                  </div>
                ) : checkInCode ? (
                  <div className="qr-code-wrapper">
                    <img
                      alt="Member QR Code"
                      className="qr-code"
                      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                        checkInCode
                      )}&size=480x480&color=${qrForegroundColor}&bgcolor=${qrBackgroundColor}`}
                      onLoad={() => setQrLoading(false)}
                      onError={() => setQrLoading(false)}
                      style={{ opacity: qrLoading ? 0 : 1 }}
                    />
                  </div>
                ) : (
                  <div className="qr-loading" style={{ marginTop: 24 }}>
                    <span className="text-muted">
                      {codeError || "Generating QR code..."}
                    </span>
                  </div>
                )}
                <p className="text-muted mt-3">
                  Show this at event check-in.
                  {secondsUntilRefresh > 0 ? (
                    <> (refreshes in {secondsUntilRefresh}s)</>
                  ) : (
                    <> (refreshing...)</>
                  )}
                </p>
                
                {/*
                <button
                  type="button"
                  className="wallet-btn wallet-btn--google"
                  onClick={handleAddToWallet("google")}
                >
                  <span className="wallet-icon" aria-hidden="true">
                    <img src="/google_wallet.svg" alt="" />
                  </span>
                  Add to Google Wallet
                </button>
                <button
                  type="button"
                  className="wallet-btn wallet-btn--apple"
                  onClick={handleAddToWallet("apple")}
                >
                  <span className="wallet-icon" aria-hidden="true">
                    <img src="/apple_wallet.svg" alt="" />
                  </span>
                  Add to Apple Wallet
                </button>
                */}
              </div>
            </div>
          </div>
        </div>
      )}
      {showCalendarModal && (
        <div
          className="home-calendar-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Chapter calendar"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowCalendarModal(false);
            }
          }}
        >
          <div className="home-calendar-modal__dialog">
            <div className="home-calendar-modal__header">
              <h5>Delta Gamma Calendar</h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowCalendarModal(false)}
                aria-label="Close calendar"
              />
            </div>
            <div className="home-calendar-modal__frame">
              <iframe
                src={GOOGLE_CALENDAR_EMBED_SRC}
                title="Theta Tau Delta Gamma calendar"
                width="100%"
                height="600"
                frameBorder="0"
                scrolling="no"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}
      {showLinkModal && (
        <div
          className="discord-link-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Link your Discord account"
        >
          <div className="discord-link-modal__card">
            <h3 className="discord-link-modal__title">Discord Linking Required</h3>
            <p>
              In order to get access to the site again please link your Discord
              account so we can connect your membership to the Discord Server.
            </p>
            <ConnectWithDiscordButton className="discord-link-modal__button" />
          </div>
        </div>
      )}
    </div>
  );
}
