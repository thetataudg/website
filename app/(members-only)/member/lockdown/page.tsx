"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Clock3,
  Home,
  Info,
  LockKeyhole,
  Radio,
  Timer,
} from "lucide-react";

import LoadingState from "../../components/LoadingState";
import { PageContainer } from "../../components/shell/PageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const timezone = "America/Phoenix";

const formatArizona = (value: string | null) => {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const computeCountdown = (timestamp: string | null, now: number) => {
  if (!timestamp) return "Awaiting schedule";
  const diff = new Date(timestamp).getTime() - now;
  if (diff <= 0) return "Reopening soon";
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [] as string[];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
};

type LockdownState = {
  active: boolean;
  reason: string;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
};

const initialState: LockdownState = {
  active: false,
  reason: "",
  durationMinutes: 0,
  startedAt: null,
  endsAt: null,
};

export default function MemberLockdownPage() {
  const router = useRouter();
  const [state, setState] = useState<LockdownState>(initialState);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const controller = new AbortController();
    const fetchState = async () => {
      try {
        const res = await fetch("/api/lockdown", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Unable to load lockdown status");
        const payload = await res.json();

        if (!payload.active) {
          router.replace("/member");
          return;
        }

        setState({
          active: true,
          reason: payload.reason || "",
          durationMinutes: Number(payload.durationMinutes || 0),
          startedAt: payload.startedAt || null,
          endsAt: payload.endsAt || null,
        });
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch lockdown state", err);
        router.replace("/member");
      }
    };
    fetchState();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [router]);

  const countdown = useMemo(() => computeCountdown(state.endsAt, now), [state.endsAt, now]);

  if (loading) {
    return <LoadingState message="Checking lockdown status..." />;
  }

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center">
      <PageContainer className="max-w-3xl py-10 sm:py-14">
        <Card className="overflow-hidden">
          <CardHeader className="items-center px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
            <Badge variant="warning" className="mb-3">
              <LockKeyhole aria-hidden="true" />
              Member services paused
            </Badge>
            <CardTitle className="text-3xl tracking-tight sm:text-4xl">
              Site on lockdown
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 sm:text-base">
              Access to member-only areas is temporarily suspended while
              leadership performs updates. The site will reopen when the
              maintenance window ends.
            </CardDescription>
          </CardHeader>

          <Separator />

          <CardContent className="space-y-6 px-6 py-6 sm:px-10 sm:py-8">
            <Alert variant="warning">
              <Info aria-hidden="true" />
              <AlertTitle>Reason</AlertTitle>
              <AlertDescription>
                {state.reason || "No reason was provided."}
              </AlertDescription>
            </Alert>

            <dl className="grid gap-3 sm:grid-cols-3">
              <StatusItem
                icon={<Clock3 aria-hidden="true" />}
                label="Started"
                value={formatArizona(state.startedAt)}
              />
              <StatusItem
                icon={<CalendarClock aria-hidden="true" />}
                label="Scheduled end"
                value={formatArizona(state.endsAt)}
              />
              <StatusItem
                icon={<Timer aria-hidden="true" />}
                label="Countdown"
                value={countdown}
                live
              />
            </dl>
          </CardContent>

          <CardFooter className="flex-col gap-3 border-t border-border bg-muted/30 px-6 py-6 sm:flex-row sm:justify-center sm:px-10">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/lockdown">
                <Radio aria-hidden="true" />
                View lockdown status
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/">
                <Home aria-hidden="true" />
                Go to public home
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </PageContainer>
    </main>
  );
}

function StatusItem({
  icon,
  label,
  value,
  live = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </dt>
      <dd
        className="mt-2 text-sm font-semibold text-foreground"
        aria-live={live ? "polite" : undefined}
        aria-atomic={live || undefined}
      >
        {value}
      </dd>
    </div>
  );
}
