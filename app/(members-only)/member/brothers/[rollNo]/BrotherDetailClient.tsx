// app/(members-only)/member/brothers/[rollNo]/BrotherDetailClient.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { Download, ExternalLink, Eye, ShieldAlert, UserCircle2 } from "lucide-react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

import type { MemberDoc } from "@/types/member";

import LoadingState from "../../../components/LoadingState";
import { PageContainer } from "../../../components/shell/PageShell";
import {
  DetailRow,
  EntryItem,
  Section,
  Stat,
} from "../../../components/shell/ProfileSections";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface BrotherDetailClientProps {
  member: MemberDoc;
  committees: { name: string }[];
}

const isRemovedMember = (value: any) => {
  if (!value || typeof value === "string") return false;
  return String(value.status || "").toLowerCase() === "removed";
};

const formatMemberRelation = (value: any) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return `${value.fName ?? ""} ${value.lName ?? ""}`.trim();
};

export default function BrotherDetailClient({
  member,
  committees,
}: BrotherDetailClientProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [viewer, setViewer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "events">("profile");
  const [attendanceEvents, setAttendanceEvents] = useState<any[]>([]);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceStart, setAttendanceStart] = useState("");
  const [attendanceEnd, setAttendanceEnd] = useState("");

  const { isLoaded, isSignedIn } = useAuth();
  const skills = (member.skills || []).filter(Boolean);
  const projects = (member.projects || []).filter((p) => p?.title || p?.description || p?.link);
  const work = (member.work || []).filter((w) => w?.title || w?.organization || w?.description);
  const awards = (member.awards || []).filter((a) => a?.title || a?.issuer || a?.description);
  const funFacts = (member.funFacts || []).filter(Boolean);
  const customSections = (member.customSections || []).filter((s) => s?.title || s?.body);

  const profileMemberId =
    typeof (member as any)?._id === "string"
      ? (member as any)._id
      : (member as any)?._id?.toString?.() || "";

  const isPrivileged =
    viewer?.role === "admin" ||
    viewer?.role === "superadmin" ||
    viewer?.isECouncil;

  useEffect(() => {
    async function loadViewer() {
      try {
        const res = await fetch("/api/members/me");
        if (!res.ok) return;
        const data = await res.json();
        setViewer(data);
      } catch {
        setViewer(null);
      }
    }
    if (isSignedIn) loadViewer();
  }, [isSignedIn]);

  useEffect(() => {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 30);
    const pad = (n: number) => String(n).padStart(2, "0");
    setAttendanceStart(
      `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
    );
    setAttendanceEnd(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    );
  }, []);

  useEffect(() => {
    if (!isSignedIn || !profileMemberId || !attendanceStart || !attendanceEnd)
      return;
    const loadAttendance = async () => {
      setAttendanceLoading(true);
      const params = new URLSearchParams({
        memberId: profileMemberId,
        start: attendanceStart,
        end: attendanceEnd,
      });
      const res = await fetch(`/api/events/attendance?${params.toString()}`);
      const data = res.ok ? await res.json() : null;
      if (data?.events) {
        setAttendanceEvents(data.events);
        setAttendanceTotal(data.events.length);
      } else {
        setAttendanceEvents([]);
        setAttendanceTotal(data?.total || 0);
      }
      setAttendanceLoading(false);
    };
    loadAttendance();
  }, [isSignedIn, profileMemberId, attendanceStart, attendanceEnd]);

  const attendanceByCommittee = useMemo(() => {
    if (!isPrivileged) return [];
    const tally = new Map<string, number>();
    attendanceEvents.forEach((evt) => {
      const key = evt.committeeName || "Chapter";
      tally.set(key, (tally.get(key) || 0) + 1);
    });
    return Array.from(tally.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }, [attendanceEvents, isPrivileged]);

  const attendanceByType = useMemo(() => {
    if (!isPrivileged) return [];
    const tally = new Map<string, number>();
    attendanceEvents.forEach((evt) => {
      const key = evt.eventType || "event";
      tally.set(key, (tally.get(key) || 0) + 1);
    });
    return Array.from(tally.entries()).map(([type, count]) => ({
      type,
      count,
    }));
  }, [attendanceEvents, isPrivileged]);

  if (!isLoaded) {
    return <LoadingState message="Loading profile..." />;
  }

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive" role="alert">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Sign-in required</AlertTitle>
          <AlertDescription>
            You must be logged in to use this function. Redirecting you to sign
            in&hellip;
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  const fullName = `${member.fName} ${member.lName}`;
  const initials =
    `${member.fName?.[0] ?? ""}${member.lName?.[0] ?? ""}`.toUpperCase();
  const activeBigs = (member.bigs || []).filter((b: any) => !isRemovedMember(b));
  const activeLittles = (member.littles || []).filter(
    (l: any) => !isRemovedMember(l)
  );
  const profileLinks = [
    { label: "GitHub", href: member.socialLinks?.github },
    { label: "LinkedIn", href: member.socialLinks?.linkedin },
    { label: "Instagram", href: member.socialLinks?.instagram },
    { label: "Website", href: member.socialLinks?.website },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  /** Date-range picker + total, shown to every viewer. */
  const attendanceControls = (
    <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="attendance-start">Start date</Label>
        <DatePicker
          id="attendance-start"
          value={attendanceStart}
          onChange={setAttendanceStart}
          placeholder="Any time"
          clearable
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="attendance-end">End date</Label>
        <DatePicker
          id="attendance-end"
          value={attendanceEnd}
          onChange={setAttendanceEnd}
          placeholder="Today"
          clearable
        />
      </div>
      <dl aria-live="polite">
        <Stat label="Events attended" value={attendanceTotal} />
      </dl>
    </div>
  );

  /* One flowing grid rather than two fixed columns — mirrors `/member/profile`.
   * With two fixed stacks, a brother who has filled in little leaves a tall
   * empty void beside the sidebar. Wide sections span both tracks; compact
   * ones pair up and reflow. */
  const profilePanel = (
    <div className="grid gap-6 md:grid-cols-2">
      <Section title="About" className="md:col-span-2">
        <p className="text-sm leading-relaxed text-foreground/90">
          {member.bio || "This brother is still building their profile."}
        </p>
      </Section>

      {profileLinks.length > 0 && (
        <Section title="Links">
          <div className="flex flex-wrap gap-2">
            {profileLinks.map((link) => (
              <Button key={link.label} variant="outline" size="sm" asChild>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="no-underline"
                >
                  {link.label}
                  <ExternalLink aria-hidden="true" />
                  <span className="sr-only">
                    {` for ${fullName}, opens in a new tab`}
                  </span>
                </a>
              </Button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Education">
        <dl className="space-y-2 text-sm">
          <DetailRow label="Majors" value={member.majors.join(", ")} />
          {member.minors?.length ? (
            <DetailRow label="Minors" value={member.minors.join(", ")} />
          ) : null}
          <DetailRow label="Graduation Year" value={member.gradYear} />
        </dl>
      </Section>

      <Section title="Fraternity Info">
        <dl className="space-y-2 text-sm">
          <DetailRow
            label="Committees"
            value={
              committees.length
                ? committees.map((c) => c.name).join(", ")
                : "None"
            }
          />
          <DetailRow label="Pledge Class" value={member.pledgeClass} />
          {activeBigs.length > 0 && (
            <DetailRow
              label={`Big${activeBigs.length > 1 ? "s" : ""}`}
              value={activeBigs
                .map((b: any) => formatMemberRelation(b))
                .join(", ")}
            />
          )}
          {activeLittles.length > 0 && (
            <DetailRow
              label={`Little${activeLittles.length > 1 ? "s" : ""}`}
              value={activeLittles
                .map((l: any) => formatMemberRelation(l))
                .join(", ")}
            />
          )}
        </dl>
      </Section>

      {skills.length > 0 && (
        <Section title="Skills">
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {skills.map((skill, idx) => (
              <li key={`${skill}-${idx}`}>
                <Badge variant="muted">{skill}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {funFacts.length > 0 && (
        <Section title="Fun Facts">
          <ul className="list-inside list-disc space-y-1 text-sm text-foreground/90">
            {funFacts.map((fact, idx) => (
              <li key={`fact-${idx}`}>{fact}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Résumé">
        {member.resumeUrl ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={member.resumeUrl} download className="no-underline">
                <Download aria-hidden="true" />
                Download
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(true)}
            >
              <Eye aria-hidden="true" />
              Preview
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {member.fName} hasn&apos;t uploaded a résumé yet.
          </p>
        )}
      </Section>

      {/* Wide narrative sections, rendered only when the brother has filled
       * them in. Their entries pair up so a single entry doesn't stretch. */}
      {projects.length > 0 && (
        <Section title="Projects" className="md:col-span-2">
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.map((project, idx) => (
              <EntryItem
                key={`project-${idx}`}
                title={project.title || "Project"}
                description={project.description}
                link={project.link}
              />
            ))}
          </ul>
        </Section>
      )}

      {work.length > 0 && (
        <Section title="Work & Internships" className="md:col-span-2">
          <ul className="grid gap-4 sm:grid-cols-2">
            {work.map((item, idx) => (
              <EntryItem
                key={`work-${idx}`}
                title={`${item.title || "Role"}${
                  item.organization ? ` • ${item.organization}` : ""
                }`}
                meta={[item.start, item.end].filter(Boolean).join(" – ")}
                description={item.description}
                link={item.link}
              />
            ))}
          </ul>
        </Section>
      )}

      {awards.length > 0 && (
        <Section title="Awards & Certifications" className="md:col-span-2">
          <ul className="grid gap-4 sm:grid-cols-2">
            {awards.map((award, idx) => (
              <EntryItem
                key={`award-${idx}`}
                title={`${award.title || "Award"}${
                  award.issuer ? ` • ${award.issuer}` : ""
                }`}
                meta={award.date}
                description={award.description}
              />
            ))}
          </ul>
        </Section>
      )}

      {customSections.length > 0 && (
        <Section title="More" className="md:col-span-2">
          <ul className="grid gap-4 sm:grid-cols-2">
            {customSections.map((section, idx) => (
              <EntryItem
                key={`section-${idx}`}
                title={section.title || "Section"}
                description={section.body}
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );

  const eventsPanel = (
    <div className="space-y-6">
      <Section title="Event Attendance">{attendanceControls}</Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="Committee totals">
          {attendanceByCommittee.length ? (
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {attendanceByCommittee.map((item) => (
                <li key={item.name}>
                  <Badge variant="secondary">
                    {item.name} ({item.count})
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance yet.</p>
          )}
        </Section>

        <Section title="Event types">
          {attendanceByType.length ? (
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {attendanceByType.map((item) => (
                <li key={item.type}>
                  <Badge variant="outline">
                    {item.type} ({item.count})
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance yet.</p>
          )}
        </Section>
      </div>

      <Section title="Events">
        {attendanceLoading ? (
          <div className="space-y-2" role="status" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading attendance…</span>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : attendanceEvents.length ? (
          <>
            {/* Desktop: full table. */}
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <caption className="sr-only">
                  {`Events ${fullName} attended between ${attendanceStart} and ${attendanceEnd}`}
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Event</TableHead>
                    <TableHead scope="col">Committee</TableHead>
                    <TableHead scope="col">Type</TableHead>
                    <TableHead scope="col" className="text-right">
                      Date
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceEvents.map((evt) => (
                    <TableRow key={evt._id}>
                      <TableCell className="font-medium text-foreground">
                        {evt.name}
                      </TableCell>
                      <TableCell>{evt.committeeName || "Chapter"}</TableCell>
                      <TableCell>{evt.eventType || "event"}</TableCell>
                      <TableCell className="text-right">
                        {evt.startTime
                          ? new Date(evt.startTime).toLocaleDateString()
                          : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: the same rows as a stacked list, so nothing scrolls sideways. */}
            <ul className="space-y-2 sm:hidden">
              {attendanceEvents.map((evt) => (
                <li
                  key={evt._id}
                  className="rounded-md border border-border p-3"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {evt.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {evt.startTime
                      ? new Date(evt.startTime).toLocaleDateString()
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      {evt.committeeName || "Chapter"}
                    </Badge>
                    <Badge variant="outline">{evt.eventType || "event"}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No attendance in this range.
          </p>
        )}
      </Section>
    </div>
  );

  return (
    <>
      <PageContainer className="space-y-6">
        {/* ── Identity header ── */}
        <section className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-start">
          <Avatar className="size-28 self-center ring-2 ring-primary/20 ring-offset-2 ring-offset-background sm:self-start">
            {member.profilePicUrl ? (
              <AvatarImage src={member.profilePicUrl} alt="" />
            ) : null}
            <AvatarFallback className="text-2xl font-semibold">
              {initials || <UserCircle2 className="size-10" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {fullName}
              </h1>
              {member.headline && (
                <p className="text-base text-foreground/80">{member.headline}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {member.hometown && <span>{member.hometown}</span>}
                {member.pronouns && (
                  <Badge variant="muted">{member.pronouns}</Badge>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Roll No" value={`#${member.rollNo}`} />
              <Stat label="Status" value={member.status} />
              <Stat label="Family Line" value={member.familyLine} />
              <Stat label="Pledge Class" value={member.pledgeClass} />
            </dl>
          </div>
        </section>

        {isPrivileged ? (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "profile" | "events")}
          >
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
            </TabsList>
            <TabsContent value="profile">{profilePanel}</TabsContent>
            <TabsContent value="events">{eventsPanel}</TabsContent>
          </Tabs>
        ) : (
          <>
            {profilePanel}
            <Section title="Event Attendance">{attendanceControls}</Section>
          </>
        )}
      </PageContainer>

      {/* ── Résumé preview ── */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Résumé Preview</DialogTitle>
          </DialogHeader>
          <div className="h-[clamp(320px,70vh,900px)] overflow-hidden rounded-md border border-border">
            <object
              data={member.resumeUrl + "#toolbar=0&navpanes=0&scrollbar=0"}
              type="application/pdf"
              width="100%"
              height="100%"
            >
              <p className="p-6 text-center text-sm text-muted-foreground">
                Unable to display PDF inline.{" "}
                <a
                  href={member.resumeUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-primary"
                >
                  Download Résumé
                </a>
              </p>
            </object>
          </div>
          <DialogFooter>
            <Button variant="outline" asChild>
              <a
                href={member.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="no-underline"
              >
                <ExternalLink aria-hidden="true" />
                Open in New Tab
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
