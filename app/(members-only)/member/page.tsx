"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { RedirectToSignIn } from "@clerk/nextjs";
import axios from "axios";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  CircleDollarSign,
  Gem,
  MapPin,
  QrCode,
  Users,
} from "lucide-react";
import LoadingState, { LoadingSpinner } from "../components/LoadingState";
import MembershipRevokedState from "../components/MembershipRevokedState";
import { useRouter } from "next/navigation";
import ConnectWithDiscordButton from "@/components/ConnectWithDiscordButton";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer } from "../components/shell/PageShell";
import { ActiveVoteToast } from "../components/ActiveVoteToast";

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

type DuesSnapshot = {
  currency: string;
  balanceCents: number;
  amountDueNowCents: number;
  dueNowDate: string | null;
  nextDueDate: string | null;
  hasOverdue: boolean;
  awaitingReview: boolean;
  creditCents: number;
};

type DashboardCommittee = {
  _id: string;
  name: string;
};

type GemMemberSnapshot = {
  memberId: string;
  /// Both requirements met. Independent of the point count: a member can hold
  /// nine points and still fail GEM on a missed meeting requirement, so the
  /// card has to say which of the two is short.
  requirementsMet: boolean;
  pointsEarned: number;
  pointsRequired: number;
  pointsAvailable: number;
  hasCompletedGem: boolean;
  requirements: { key: string; label: string; satisfied: boolean }[];
};

type GemStatusResponse = {
  members: GemMemberSnapshot[];
};

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
  const [homePanelsLoading, setHomePanelsLoading] = useState(true);
  const [homePanelsError, setHomePanelsError] = useState<string | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<DashboardEvent[]>([]);
  const [committeeMeetings, setCommitteeMeetings] = useState<DashboardEvent[]>(
    []
  );
  const [committeeNames, setCommitteeNames] = useState<Record<string, string>>(
    {}
  );
  const [gemSnapshot, setGemSnapshot] = useState<GemMemberSnapshot | null>(null);
  const [dues, setDues] = useState<DuesSnapshot | null>(null);
  const [duesLoading, setDuesLoading] = useState(true);
  const [duesError, setDuesError] = useState<string | null>(null);
  const [walletPassStatus, setWalletPassStatus] = useState<
    "idle" | "loading" | "success"
  >("idle");
  const walletPassResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleAddToAppleWallet = async () => {
    if (walletPassStatus === "loading") return;

    setWalletPassStatus("loading");

    try {
      const response = await fetch("/api/wallet/apple-pass", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        let message = "Failed to generate Apple Wallet pass";
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore JSON parse failures
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const fileName = fileNameMatch?.[1] || "member-pass.pkpass";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      setWalletPassStatus("success");
      if (walletPassResetTimeoutRef.current) {
        clearTimeout(walletPassResetTimeoutRef.current);
      }
      walletPassResetTimeoutRef.current = setTimeout(() => {
        setWalletPassStatus("idle");
      }, 2500);
    } catch (error) {
      console.error("Error generating Apple Wallet pass:", error);
      setWalletPassStatus("idle");
    }
  };

  const needsDiscordLink =
    !loadingUserData &&
    Boolean(userData?.memberId) &&
    !userData?.discordId &&
    !userData?.pending;
  const normalizedMemberStatus = String(userData?.type || "").toLowerCase();
  const hasDashboardAccess = Boolean(
    userData?.memberId &&
      userData?.userHasProfile &&
      !userData?.pending &&
      (normalizedMemberStatus === "active" ||
        normalizedMemberStatus === "alumni")
  );

  useEffect(() => {
    setShowLinkModal(needsDiscordLink);
  }, [needsDiscordLink]);

  useEffect(() => {
    return () => {
      if (walletPassResetTimeoutRef.current) {
        clearTimeout(walletPassResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await axios.get("/api/members/me");
        const data = response.data;

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
      setSecondsUntilRefresh(() => {
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
    if (!hasDashboardAccess || !userData?.memberId) return;
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
          // Scoped to this member: an officer's unscoped request comes back
          // with the whole chapter, and the card is about them.
          fetch(`/api/gem/status?memberId=${encodeURIComponent(userData.memberId)}`),
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
        setCommitteeNames({});
        setGemSnapshot(null);
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
    hasDashboardAccess,
    userData?.memberId,
  ]);

  useEffect(() => {
    if (!hasDashboardAccess) return;
    const controller = new AbortController();

    const loadDues = async () => {
      setDuesLoading(true);
      setDuesError(null);
      try {
        const response = await fetch("/api/dues/me", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to load dues.");
        const snapshot = (await response.json()) as DuesSnapshot;
        setDues(snapshot);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load dashboard dues:", error);
        setDues(null);
        setDuesError("Dues couldn't be loaded right now.");
      } finally {
        if (!controller.signal.aborted) setDuesLoading(false);
      }
    };

    loadDues();
    return () => controller.abort();
  }, [hasDashboardAccess]);

  if (!isLoaded || loadingUserData) {
    return <LoadingState message="Loading dashboard..." />;
  }

  if (needsOnboarding) {
    return <LoadingState message="Redirecting to the onboarding form..." />;
  }

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            You must be logged in to use this function.
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  if (
    normalizedMemberStatus === "removed" ||
    normalizedMemberStatus === "deceased"
  ) {
    return <MembershipRevokedState />;
  }

  if (!hasDashboardAccess) {
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
      <PageContainer className="space-y-6">
        <DashboardHero
          firstName={user?.firstName}
          description="Your membership access is still being verified."
          badges={
            <>
              <Badge variant="warning">
                <Clock aria-hidden="true" />
                Status: {userData?.type || "Pending"}
              </Badge>
              <Badge variant="muted">Profile review in progress</Badge>
            </>
          }
          aside={
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Clock className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-foreground">Awaiting approval</p>
                <p className="text-sm text-muted-foreground">
                  An officer will confirm your profile shortly.
                </p>
              </div>
            </div>
          }
        />

        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Your profile is not yet approved. Please contact an officer if you
            believe this is an error.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">My permissions</CardTitle>
            <CardDescription>
              Access unlocks once an officer approves your profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border border-t border-border">
              {privileges.map((priv) => (
                <li
                  key={priv.label}
                  className="flex items-center justify-between px-6 py-3"
                >
                  <span className="text-sm text-foreground">{priv.label}</span>
                  <Badge variant="muted">
                    <Clock aria-hidden="true" />
                    Locked
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </PageContainer>
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

  const gemPointsEarned = gemSnapshot?.pointsEarned || 0;
  const gemPointsRequired = gemSnapshot?.pointsRequired || 7;
  const gemCompletionPercent = Math.round(
    (gemPointsEarned / Math.max(1, gemPointsRequired)) * 100
  );
  const gemShortfall = gemSnapshot
    ? gemSnapshot.requirements.filter((row) => !row.satisfied).map((row) => row.label)
    : [];

  const statusUpdates: {
    variant: "warning" | "info";
    text: string;
  }[] = [];
  if (!userHasProfile) {
    statusUpdates.push({
      variant: "warning",
      text: "You do not have access to this tool yet. Please contact an admin if you believe this is an error.",
    });
  }
  if (needsPermissionReview) {
    statusUpdates.push({
      variant: "info",
      text: "Since you marked yourself as E-Council, your extended permissions are being verified.",
    });
  }
  if (needsProfileReview && !needsPermissionReview) {
    statusUpdates.push({
      variant: "info",
      text: "Your profile changes are awaiting review.",
    });
  }

  const nextEvent = upcomingEvents[0] ?? committeeMeetings[0] ?? null;
  const restOfChapterEvents = upcomingEvents.filter(
    (event) => event._id !== nextEvent?._id
  );
  const restOfMeetings = committeeMeetings.filter(
    (event) => event._id !== nextEvent?._id
  );

  return (
    <PageContainer className="space-y-8">
      {/* A vote runs for minutes and then it is gone, which is the one thing
        * here worth interrupting for. */}
      <ActiveVoteToast />

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="m-0 truncate text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {user?.firstName || "Brother"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="secondary">Status: {type}</Badge>
            {userTypeDetails ? (
              <Badge variant="outline">{userTypeDetails}</Badge>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="shrink-0"
          onClick={() => setShowQr(true)}
        >
          <QrCode className="size-4" aria-hidden="true" />
          My check-in code
        </Button>
      </section>

      {statusUpdates.length ? (
        <div className="space-y-3">
          {statusUpdates.map((update, index) => (
            <Alert key={index} variant={update.variant}>
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{update.text}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      {homePanelsError ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>{homePanelsError}</AlertDescription>
        </Alert>
      ) : null}

      {/* What is next, what you owe, and where you stand — the three things a
        * member opens this page to find out. */}
      <section className="grid gap-4 lg:grid-cols-3">
        <NextUpCard
          event={nextEvent}
          loading={homePanelsLoading}
          committeeName={
            nextEvent?.committeeId ? committeeNames[nextEvent.committeeId] : undefined
          }
          formatDate={formatEventDate}
          formatTime={formatEventTime}
        />

        <DashboardDuesCard
          dues={dues}
          loading={duesLoading}
          error={duesError}
        />

        <GemCard
          snapshot={gemSnapshot}
          loading={homePanelsLoading}
          percent={gemCompletionPercent}
          earned={gemPointsEarned}
          required={gemPointsRequired}
          shortfall={gemShortfall}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <EventPanel
          icon={<CalendarDays aria-hidden="true" />}
          title="Chapter events"
          description="Chapter-wide events you can plan for."
          loading={homePanelsLoading}
          events={restOfChapterEvents}
          emptyText="Nothing else on the chapter calendar this week."
          formatEventDate={formatEventDate}
          renderMeta={(event) => (
            <>
              <span>
                {formatEventTime(event.startTime)} – {formatEventTime(event.endTime)}
              </span>
              {event.location ? <span>{event.location}</span> : null}
            </>
          )}
          footerHref="/member/events"
          footerLabel="View all events"
        />

        <EventPanel
          icon={<Users aria-hidden="true" />}
          title="Committee meetings"
          description="Meetings for committees you are assigned to."
          loading={homePanelsLoading}
          events={restOfMeetings}
          emptyText="No committee meetings scheduled."
          formatEventDate={formatEventDate}
          renderMeta={(event) => (
            <>
              {event.committeeId && committeeNames[event.committeeId] ? (
                <span>{committeeNames[event.committeeId]}</span>
              ) : null}
              <span>
                {formatEventTime(event.startTime)} – {formatEventTime(event.endTime)}
              </span>
            </>
          )}
          footerHref="/member/events"
          footerLabel="Open events"
        />
      </section>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>My Check-In Code</DialogTitle>
            <DialogDescription>
              Show this at event check-in.
              {secondsUntilRefresh > 0
                ? ` Refreshes in ${secondsUntilRefresh}s.`
                : " Refreshing…"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4">
            {qrLoading ? (
              <div
                className="flex flex-col items-center gap-3 py-8"
                role="status"
                aria-busy="true"
              >
                <Skeleton className="size-56 rounded-lg" />
                <span className="text-sm text-muted-foreground">
                  Loading QR code…
                </span>
              </div>
            ) : checkInCode ? (
              <div className="rounded-lg border border-border bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Member check-in QR code"
                  className="size-56"
                  src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                    checkInCode
                  )}&size=480x480&color=${qrForegroundColor}&bgcolor=${qrBackgroundColor}`}
                  onLoad={() => setQrLoading(false)}
                  onError={() => setQrLoading(false)}
                />
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertDescription>
                  {codeError || "Generating QR code…"}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleAddToAppleWallet}
              disabled={walletPassStatus === "loading"}
              aria-busy={walletPassStatus === "loading"}
            >
              <span aria-hidden="true" className="inline-flex">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/apple_wallet.svg" alt="" className="h-4" />
              </span>
              {walletPassStatus === "loading" ? (
                <>
                  <LoadingSpinner size="sm" />
                  Generating Pass…
                </>
              ) : walletPassStatus === "success" ? (
                "Pass Generated"
              ) : (
                "Add to Apple Wallet"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* {showLinkModal && (
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
      )} */}
    </PageContainer>
  );
}

/* ---------------- presentational helpers ---------------- */

/** "Good morning" / "Good afternoon" / "Good evening", in chapter time. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Phoenix",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function IconPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary [&_svg]:size-4">
      {children}
    </span>
  );
}

function DashboardHero({
  firstName,
  description,
  badges,
  aside,
}: {
  firstName?: string | null;
  description?: string;
  badges: React.ReactNode;
  aside: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-3">
        <h1 className="m-0 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">{badges}</div>
      </div>
      <div className="w-full shrink-0 sm:w-auto sm:max-w-xs">{aside}</div>
    </section>
  );
}

/**
 * The one event happening soonest.
 *
 * The largest thing on the page, because "what have I got on" is the question
 * most people open a chapter dashboard to answer, and it used to be the fourth
 * line of a list.
 */
function NextUpCard({
  event,
  loading,
  committeeName,
  formatDate,
  formatTime,
}: {
  event: DashboardEvent | null;
  loading: boolean;
  committeeName?: string;
  formatDate: (value: string) => string;
  formatTime: (value: string) => string;
}) {
  if (loading && !event) {
    return (
      <Card>
        <CardHeader className="space-y-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardHeader>
      </Card>
    );
  }

  if (!event) {
    return (
      <QuietCard
        icon={<CalendarClock className="size-5" aria-hidden="true" />}
        title="Next up"
        body="Nothing on the calendar yet."
        href="/member/events"
        action="Open events"
      />
    );
  }

  return (
    <Card className="border-primary/40 lg:col-span-1">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            Next up
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(event.startTime)}
          </span>
        </div>

        <CardTitle className="text-lg leading-snug">{event.name}</CardTitle>

        <CardDescription className="space-y-1">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {formatTime(event.startTime)} – {formatTime(event.endTime)}
          </span>
          {event.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {event.location}
            </span>
          ) : null}
          {committeeName ? (
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5 shrink-0" aria-hidden="true" />
              {committeeName}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * Dues owns its request state instead of borrowing the schedule/GEM state.
 * A missing snapshot while loading is unknown, never a zero balance.
 */
function DashboardDuesCard({
  dues,
  loading,
  error,
}: {
  dues: DuesSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <Card aria-busy="true" aria-label="Loading dues">
        <CardHeader className="space-y-3">
          <Skeleton className="h-3 w-16" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </CardHeader>
        <CardFooter>
          <Skeleton className="h-9 w-full" />
        </CardFooter>
      </Card>
    );
  }

  if (error || !dues) {
    return (
      <QuietCard
        icon={<AlertTriangle className="size-5" aria-hidden="true" />}
        title="Dues"
        body={error || "Dues couldn't be loaded right now."}
        href="/member/dues"
        action="Open dues"
      />
    );
  }

  const owes =
    dues.amountDueNowCents > 0 ||
    dues.balanceCents > 0 ||
    dues.awaitingReview;
  if (owes) return <DuesCard dues={dues} />;

  return (
    <QuietCard
      icon={<CircleDollarSign className="size-5" aria-hidden="true" />}
      title="Dues"
      body={
        dues.creditCents > 0
          ? `The chapter owes you ${formatMoney(dues.creditCents)}.`
          : "Nothing outstanding. You're square with the chapter."
      }
      href="/member/dues"
      action="Open dues"
    />
  );
}

/**
 * What this member owes, and only when they owe it.
 *
 * A zero balance is not news, and a card that says so every day is noise — so
 * the dashboard shows the quiet version instead.
 */
function DuesCard({ dues }: { dues: DuesSnapshot }) {
  const amount = dues.amountDueNowCents || dues.balanceCents;
  const due = dues.dueNowDate || dues.nextDueDate;

  const subtitle = dues.awaitingReview
    ? "Waiting on the treasurer"
    : dues.hasOverdue
    ? "Past due"
    : due
    ? `Due ${new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Phoenix",
        month: "short",
        day: "numeric",
      }).format(new Date(due))}`
    : "Open balance";

  return (
    <Card className={cn(dues.hasOverdue && "border-destructive/50")}>
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dues owed
          </span>
          {dues.hasOverdue ? (
            <Badge variant="destructive">Past due</Badge>
          ) : dues.awaitingReview ? (
            <Badge variant="warning">In review</Badge>
          ) : null}
        </div>

        <p className="m-0 text-3xl font-semibold tabular-nums">
          {formatMoney(amount, dues.currency)}
        </p>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Link
          href="/member/dues"
          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground no-underline transition-colors hover:bg-primary/90"
        >
          Pay or submit a receipt
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}

/** GEM standing, as a ring — the same shape the app draws it in. */
function GemCard({
  snapshot,
  loading,
  percent,
  earned,
  required,
  shortfall,
}: {
  snapshot: GemMemberSnapshot | null;
  loading: boolean;
  percent: number;
  earned: number;
  required: number;
  shortfall: string[];
}) {
  if (loading && !snapshot) {
    return (
      <Card>
        <CardHeader className="space-y-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardHeader>
      </Card>
    );
  }

  const complete = snapshot?.hasCompletedGem ?? false;

  return (
    <Card>
      <CardHeader className="gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          GEM progress
        </span>

        <div className="flex items-center gap-4">
          <GemRing percent={percent} earned={complete} />
          <div className="min-w-0">
            <p className="m-0 text-2xl font-semibold tabular-nums">
              {earned}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {required}
              </span>
            </p>
            <p className="m-0 text-sm text-muted-foreground">points earned</p>
          </div>
        </div>

        <CardDescription>
          {complete
            ? "GEM earned for this semester."
            : shortfall.length
            ? `Still needed: ${shortfall.join(", ")}`
            : "On track. Keep going."}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link
          href="/member/gem"
          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-input px-3 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          See your GEM
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}

/** A progress ring. Gold once GEM is earned, brand crimson while in progress. */
function GemRing({ percent, earned }: { percent: number; earned: boolean }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0.01, Math.min(1, percent / 100));

  return (
    <span className="relative flex size-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-muted"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          className={earned ? "stroke-amber-500" : "stroke-primary"}
        />
      </svg>
      <span className="absolute">
        {earned ? (
          <Check className="size-5 text-amber-500" aria-hidden="true" />
        ) : (
          <Gem className="size-5 text-primary" aria-hidden="true" />
        )}
      </span>
      <span className="sr-only">{percent}% of GEM points earned</span>
    </span>
  );
}

/** The version of a standing card shown when there is nothing to report. */
function QuietCard({
  icon,
  title,
  body,
  href,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{icon}</span>
          <p className="m-0 text-sm text-foreground">{body}</p>
        </div>
      </CardHeader>
      <CardFooter>
        <Link
          href={href}
          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-input px-3 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {action}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}

function EventPanel({
  icon,
  title,
  description,
  loading,
  events,
  emptyText,
  renderMeta,
  formatEventDate,
  footerHref,
  footerLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  loading: boolean;
  events: DashboardEvent[];
  emptyText: string;
  renderMeta: (event: DashboardEvent) => React.ReactNode;
  formatEventDate: (value: string) => string;
  footerHref: string;
  footerLabel: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <IconPill>{icon}</IconPill>
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        {loading ? (
          <div className="space-y-3 px-6 pb-2" role="status" aria-busy="true">
            <span className="sr-only">Loading {title.toLowerCase()}…</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : events.length > 0 ? (
          <ul className="m-0 divide-y divide-border border-t border-border p-0">
            {events.map((event) => (
              <li key={event._id} className="list-none px-6 py-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-primary">
                  {formatEventDate(event.startTime)}
                </p>
                <h3 className="m-0 mt-0.5 text-sm font-medium text-foreground">
                  {event.name}
                </h3>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  {renderMeta(event)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 pb-2">
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-6">
        <Link
          href={footerHref}
          className={cn(
            "inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-input px-3 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          {footerLabel}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </CardFooter>
    </Card>
  );
}
