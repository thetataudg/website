// app/(members-only)/member/brothers/MembersList.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, ShieldAlert, Users, X } from "lucide-react";

import BrotherQuickLook, { type QuickLookSeed } from "./BrotherQuickLook";
import AlphabetIndex, {
  LETTERS,
  letterSectionId,
} from "./AlphabetIndex";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

import LoadingState from "../../components/LoadingState";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";
import { EmptyState } from "../../components/shell/States";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MemberData {
  rollNo: string;
  fName: string;
  lName: string;
  majors: string[];
  profilePicUrl?: string;
  socialLinks?: { github?: string; linkedin?: string };
  status: "Active" | "Alumni" | string;
}

type StatusFilter = "All" | "Active" | "Alumni";
type SortMode = "name" | "roll";

/** The index bucket a member falls into: first letter of the last name. */
function indexLetter(member: MemberData) {
  const initial = (member.lName || member.fName || "").trim()[0]?.toUpperCase();
  return initial && initial >= "A" && initial <= "Z" ? initial : "#";
}

/** Roll numbers sort numerically first, then lexically as a tiebreak. */
function rollNoValue(rollNo: string) {
  const cleaned = rollNo.replace(/\D/g, "");
  const value = Number.parseInt(cleaned, 10);
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

export default function MembersList({
  initialMembers,
}: {
  initialMembers: MemberData[];
}) {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [myRollNo, setMyRollNo] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [quickLook, setQuickLook] = useState<QuickLookSeed | null>(null);
  const [sort, setSort] = useState<SortMode>("name");

  const { isLoaded, isSignedIn } = useAuth();

  // 1) fetch current user's rollNo
  useEffect(() => {
    fetch("/api/members/me")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { rollNo: string }) => setMyRollNo(data.rollNo))
      .catch(() => setMyRollNo(null));
  }, []);

  const sorted = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = initialMembers
      .filter((m) => (filter === "All" ? true : m.status === filter))
      .filter((m) => {
        if (!needle) return true;
        const haystack =
          `${m.rollNo} ${m.fName} ${m.lName} ${m.majors.join(" ")}`.toLowerCase();
        return haystack.includes(needle);
      });

    if (sort === "name") {
      return [...filtered].sort((a, b) => {
        const last = a.lName.localeCompare(b.lName, undefined, {
          sensitivity: "base",
        });
        if (last !== 0) return last;
        return a.fName.localeCompare(b.fName, undefined, {
          sensitivity: "base",
        });
      });
    }

    return [...filtered].sort((a, b) => {
      const aNum = rollNoValue(a.rollNo);
      const bNum = rollNoValue(b.rollNo);
      if (aNum !== bNum) return aNum - bNum;
      return a.rollNo.localeCompare(b.rollNo);
    });
  }, [initialMembers, filter, query, sort]);

  /** A–Z sections, in rail order, containing only letters that have members. */
  const sections = useMemo(() => {
    if (sort !== "name") return [];
    const buckets = new Map<string, MemberData[]>();
    sorted.forEach((m) => {
      const letter = indexLetter(m);
      const bucket = buckets.get(letter);
      if (bucket) bucket.push(m);
      else buckets.set(letter, [m]);
    });
    return LETTERS.filter((letter) => buckets.has(letter)).map((letter) => ({
      letter,
      members: buckets.get(letter)!,
    }));
  }, [sorted, sort]);

  const availableLetters = useMemo(
    () => new Set(sections.map((section) => section.letter)),
    [sections]
  );

  const jumpToLetter = (letter: string) => {
    const target = document.getElementById(letterSectionId(letter));
    if (!target) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
    // Move keyboard focus with the scroll, so the jump is not visual-only.
    target.focus({ preventScroll: true });
  };

  if (!isLoaded) {
    return <LoadingState message="Loading brothers..." />;
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

  const isFiltered = filter !== "All" || query.trim() !== "";

  const renderCard = (m: MemberData) => {
            const isMe = m.rollNo === myRollNo;
            const href = isMe
              ? `/member/profile/${m.rollNo}`
              : `/member/brothers/${m.rollNo}`;
            const fullName = `${m.fName} ${m.lName}`;
            const initials =
              `${m.fName?.[0] ?? ""}${m.lName?.[0] ?? ""}`.toUpperCase();
            const majors = m.majors.filter(Boolean).join(", ");

            return (
              <li key={m.rollNo} className="min-w-0">
                <Card className="flex h-full flex-col transition-colors focus-within:border-primary/60 hover:border-primary/40">
                  <CardContent className="flex flex-1 flex-col items-center gap-3 p-6 text-center">
                    <Avatar className="size-20 ring-2 ring-primary/20 ring-offset-2 ring-offset-card">
                      {m.profilePicUrl ? (
                        <AvatarImage src={m.profilePicUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="text-lg font-semibold">
                        {initials || <Users className="size-7" aria-hidden="true" />}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 space-y-1">
                      <h2 className="truncate text-base font-semibold text-foreground">
                        {fullName}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        #{m.rollNo}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-1.5">
                      <Badge variant={m.status === "Alumni" ? "muted" : "secondary"}>
                        {m.status}
                      </Badge>
                      {isMe && <Badge variant="outline">You</Badge>}
                    </div>

                    {majors && (
                      <p className="text-sm text-muted-foreground">{majors}</p>
                    )}

                    {(m.socialLinks?.github || m.socialLinks?.linkedin) && (
                      <div className="flex flex-wrap justify-center gap-2 pt-1">
                        {m.socialLinks?.github && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 font-normal !text-primary !no-underline hover:bg-primary/10 hover:!text-primary"
                            asChild
                          >
                            <a
                              href={m.socialLinks.github}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              GitHub
                              <ExternalLink className="!size-3.5" aria-hidden="true" />
                              <span className="sr-only">
                                {` for ${fullName}, opens in a new tab`}
                              </span>
                            </a>
                          </Button>
                        )}
                        {m.socialLinks?.linkedin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 font-normal !text-primary !no-underline hover:bg-primary/10 hover:!text-primary"
                            asChild
                          >
                            <a
                              href={m.socialLinks.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              LinkedIn
                              <ExternalLink className="!size-3.5" aria-hidden="true" />
                              <span className="sr-only">
                                {` for ${fullName}, opens in a new tab`}
                              </span>
                            </a>
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="p-6 pt-0">
                    <Button
                      variant="outline"
                      className="w-full font-normal"
                      onClick={() =>
                        setQuickLook({
                          rollNo: m.rollNo,
                          fName: m.fName,
                          lName: m.lName,
                          majors: m.majors,
                          profilePicUrl: m.profilePicUrl,
                          status: m.status,
                          href,
                          isMe,
                        })
                      }
                    >
                      View profile
                      <span className="sr-only">{` for ${fullName}`}</span>
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            );
  };

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Brothers"
        description="Search the chapter directory."
      />

      {/* ── Directory controls ── */}
      <section
        aria-label="Directory filters"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="brothers-search">Search</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="brothers-search"
              type="search"
              className="px-9 [&::-webkit-search-cancel-button]:appearance-none"
              placeholder="Name, roll number, or major"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                onClick={() => setQuery("")}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5 sm:w-44">
          <Label htmlFor="brothers-status">Status</Label>
          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as StatusFilter)}
          >
            <SelectTrigger id="brothers-status">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Alumni">Alumni</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:w-44">
          <Label htmlFor="brothers-sort">Sort</Label>
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as SortMode)}
          >
            <SelectTrigger id="brothers-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Last name (A to Z)</SelectItem>
              <SelectItem value="roll">Roll number</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {sorted.length} {sorted.length === 1 ? "brother" : "brothers"}
        {isFiltered ? " match your filters" : ""}
      </p>

      {/* Mobile jump strip. A 27-item vertical rail cannot fit a phone viewport
       * at an accessible target size, so the index becomes a horizontal row of
       * 44px targets here and a sticky rail from `sm` up. */}
      {sort === "name" && sections.length > 0 && (
        <AlphabetIndex
          variant="strip"
          available={availableLetters}
          onJump={jumpToLetter}
          className="-mx-4 px-4 sm:hidden"
        />
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden="true" />}
          title="No brothers found"
          description="No one matches the current search and status filter."
          action={
            isFiltered ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : sort === "name" ? (
        <div className="relative">
          <div className="space-y-8 sm:pr-10">
            {sections.map(({ letter, members }) => (
              <section
                key={letter}
                aria-labelledby={letterSectionId(letter)}
              >
                <h2
                  id={letterSectionId(letter)}
                  tabIndex={-1}
                  className="mb-3 flex scroll-mt-24 items-center gap-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="text-base text-foreground">{letter}</span>
                  <span
                    aria-hidden="true"
                    className="h-px flex-1 bg-border"
                  />
                  <span
                    aria-hidden="true"
                    className="font-normal normal-case tracking-normal"
                  >
                    {members.length}
                  </span>
                  <span className="sr-only">
                    {`${members.length} ${
                      members.length === 1 ? "brother" : "brothers"
                    }`}
                  </span>
                </h2>
                <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {members.map(renderCard)}
                </ul>
              </section>
            ))}
          </div>

          {/* Sticky jump rail. `pointer-events-none` on the track so it never
           * steals clicks from the cards beneath it. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-8 sm:block">
            <div className="pointer-events-auto sticky top-24">
              <AlphabetIndex
                variant="rail"
                available={availableLetters}
                onJump={jumpToLetter}
              />
            </div>
          </div>
        </div>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map(renderCard)}
        </ul>
      )}

      <BrotherQuickLook
        seed={quickLook}
        open={quickLook !== null}
        onOpenChange={(next) => {
          if (!next) setQuickLook(null);
        }}
      />
    </PageContainer>
  );
}
