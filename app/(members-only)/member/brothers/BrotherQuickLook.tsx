// app/(members-only)/member/brothers/BrotherQuickLook.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, GraduationCap, UserCircle2 } from "lucide-react";

import type { MemberDoc } from "@/types/member";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** The subset the directory already has, so the card can paint before the fetch lands. */
export interface QuickLookSeed {
  rollNo: string;
  fName: string;
  lName: string;
  majors: string[];
  profilePicUrl?: string;
  status: string;
  /** Where "Open full profile" goes: own profile vs. brother detail route. */
  href: string;
  isMe: boolean;
}

const formatRelation = (value: any) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return `${value.fName ?? ""} ${value.lName ?? ""}`.trim();
};

const isRemovedMember = (value: any) => {
  if (!value || typeof value === "string") return false;
  return String(value.status || "").toLowerCase() === "removed";
};

export default function BrotherQuickLook({
  seed,
  open,
  onOpenChange,
}: {
  seed: QuickLookSeed | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [member, setMember] = useState<MemberDoc | null>(null);
  const [committees, setCommittees] = useState<{ name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Detail already fetched this session, keyed by roll number. */
  const cache = useRef(
    new Map<string, { member: MemberDoc; committees: { name: string }[] }>()
  );

  const rollNo = seed?.rollNo;

  useEffect(() => {
    if (!open || !rollNo) return;

    const cached = cache.current.get(rollNo);
    if (cached) {
      setMember(cached.member);
      setCommittees(cached.committees);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMember(null);
    setCommittees([]);

    (async () => {
      try {
        const res = await fetch(
          `/api/members/${encodeURIComponent(rollNo)}`
        );
        if (!res.ok) throw new Error("Could not load this profile.");
        const doc = (await res.json()) as MemberDoc;

        let committeeList: { name: string }[] = [];
        const memberId = (doc as any)?._id;
        if (memberId) {
          const cRes = await fetch(
            `/api/committees?memberId=${encodeURIComponent(String(memberId))}`
          );
          if (cRes.ok) committeeList = await cRes.json();
        }

        if (cancelled) return;
        cache.current.set(rollNo, { member: doc, committees: committeeList });
        setMember(doc);
        setCommittees(committeeList);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load this profile."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, rollNo]);

  if (!seed) return null;

  const fullName = `${seed.fName} ${seed.lName}`;
  const initials = `${seed.fName?.[0] ?? ""}${seed.lName?.[0] ?? ""}`.toUpperCase();
  const majors = seed.majors.filter(Boolean).join(", ");

  const activeBigs = (member?.bigs || []).filter((b) => !isRemovedMember(b));
  const activeLittles = (member?.littles || []).filter((l) => !isRemovedMember(l));
  const skills = (member?.skills || []).filter(Boolean);
  const funFacts = (member?.funFacts || []).filter(Boolean);
  const profileLinks = [
    { label: "GitHub", href: member?.socialLinks?.github },
    { label: "LinkedIn", href: member?.socialLinks?.linkedin },
    { label: "Instagram", href: member?.socialLinks?.instagram },
    { label: "Website", href: member?.socialLinks?.website },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  /** Inline "value + label" pairs under the identity block. */
  const stats = [
    { label: "Roll No", value: `#${seed.rollNo}` },
    { label: "Pledge Class", value: member?.pledgeClass },
    { label: "Family", value: member?.familyLine },
    {
      label: "Grad",
      value: member?.gradYear ? String(member.gradYear) : undefined,
    },
  ].filter((stat) => Boolean(stat.value));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        {/* Cover band: a restrained brand wash, not a full-bleed gradient. */}
        <div
          className="h-24 w-full bg-gradient-to-br from-primary/25 via-primary/10 to-secondary/20"
          aria-hidden="true"
        />

        {/* Identity header. Deliberately NOT inside the scroll container: the
         * avatar's -mt-10 overlap onto the cover band is clipped by an
         * `overflow-y-auto` ancestor. */}
        <div className="px-6 pb-1">
          <div className="flex items-end justify-between gap-4">
            <Avatar className="-mt-10 size-20 border-4 border-background">
              {seed.profilePicUrl ? (
                <AvatarImage src={seed.profilePicUrl} alt="" />
              ) : null}
              <AvatarFallback className="text-lg font-semibold">
                {initials || <UserCircle2 className="size-8" aria-hidden="true" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap items-center gap-2 pt-4">
              <Badge variant={seed.status === "Alumni" ? "muted" : "secondary"}>
                {seed.status}
              </Badge>
              {seed.isMe && <Badge variant="outline">You</Badge>}
            </div>
          </div>

          <DialogHeader className="mt-3 space-y-1 text-left">
            <DialogTitle className="text-xl">{fullName}</DialogTitle>
            <DialogDescription>
              {member?.headline || majors || `Roll #${seed.rollNo}`}
            </DialogDescription>
          </DialogHeader>

        </div>

        <div className="overflow-y-auto px-6 pb-6">
          {loading ? (
            <div
              className="mt-4 space-y-3"
              role="status"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">{`Loading ${fullName}'s profile`}</span>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive" role="alert" className="mt-4">
              <AlertDescription>
                {error} You can still open the full profile page.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {member?.bio && (
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">
                  {member.bio}
                </p>
              )}

              {stats.length > 0 && (
                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-baseline gap-1.5"
                    >
                      <dd className="font-semibold tabular-nums text-foreground">
                        {stat.value}
                      </dd>
                      <dt className="text-muted-foreground">{stat.label}</dt>
                    </div>
                  ))}
                </dl>
              )}

              <Tabs defaultValue="about" className="mt-5">
                <TabsList className="w-full">
                  <TabsTrigger value="about" className="flex-1">
                    About
                  </TabsTrigger>
                  <TabsTrigger value="chapter" className="flex-1">
                    Chapter
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="about" className="space-y-4">
                  <dl className="space-y-2 text-sm">
                    <QuickRow
                      icon={<GraduationCap aria-hidden="true" />}
                      label="Majors"
                      value={majors}
                    />
                    {member?.minors?.length ? (
                      <QuickRow label="Minors" value={member.minors.join(", ")} />
                    ) : null}
                    {member?.hometown ? (
                      <QuickRow label="Hometown" value={member.hometown} />
                    ) : null}
                    {member?.pronouns ? (
                      <QuickRow label="Pronouns" value={member.pronouns} />
                    ) : null}
                  </dl>

                  {skills.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Skills
                        </p>
                        <ul className="flex list-none flex-wrap gap-2 p-0">
                          {skills.map((skill, idx) => (
                            <li key={`${skill}-${idx}`}>
                              <Badge variant="muted">{skill}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  {funFacts.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Fun facts
                        </p>
                        <ul className="list-inside list-disc space-y-1 text-sm text-foreground/90">
                          {funFacts.map((fact, idx) => (
                            <li key={`fact-${idx}`}>{fact}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  {profileLinks.length > 0 && (
                    <>
                      <Separator />
                      <div className="flex flex-wrap gap-2">
                        {profileLinks.map((link) => (
                          <Button
                            key={link.label}
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className="no-underline"
                            >
                              {link.label}
                              <ExternalLink aria-hidden="true" />
                              <span className="sr-only">
                                {` for ${fullName} (opens in a new tab)`}
                              </span>
                            </a>
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="chapter">
                  <dl className="space-y-2 text-sm">
                    <QuickRow
                      label="Committees"
                      value={
                        committees.length
                          ? committees.map((c) => c.name).join(", ")
                          : "None"
                      }
                    />
                    <QuickRow
                      label="Pledge Class"
                      value={member?.pledgeClass}
                    />
                    <QuickRow label="Family Line" value={member?.familyLine} />
                    {activeBigs.length > 0 && (
                      <QuickRow
                        label={`Big${activeBigs.length > 1 ? "s" : ""}`}
                        value={activeBigs.map(formatRelation).join(", ")}
                      />
                    )}
                    {activeLittles.length > 0 && (
                      <QuickRow
                        label={`Little${activeLittles.length > 1 ? "s" : ""}`}
                        value={activeLittles.map(formatRelation).join(", ")}
                      />
                    )}
                    {member?.ecouncilPosition ? (
                      <QuickRow
                        label="E-Council"
                        value={member.ecouncilPosition}
                      />
                    ) : null}
                  </dl>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button asChild className="w-full sm:w-auto">
            {/* A real link, so it still supports open-in-new-tab. */}
            <Link href={seed.href} className="no-underline">
              Open full profile
              <span className="sr-only">{` for ${fullName}`}</span>
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickRow({
  label,
  value,
  icon,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="flex items-center gap-1.5 font-medium text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        {label}:
      </dt>
      <dd className="min-w-0 text-muted-foreground">{value}</dd>
    </div>
  );
}
