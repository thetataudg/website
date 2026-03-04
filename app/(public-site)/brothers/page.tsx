"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Bungee } from "next/font/google";
import { FaGithub, FaLinkedin } from "react-icons/fa";

const bungee = Bungee({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

type Member = {
  rollNo: string;
  fName: string;
  lName: string;
  majors: string[];
  gradYear?: number;
  status?: string;
  role?: string;
  isECouncil?: boolean;
  ecouncilPosition?: string;
  isCommitteeHead?: boolean;
  profilePicUrl?: string;
  socialLinks?: { github?: string; linkedin?: string };
  isHidden?: boolean;
};

const fallbackGradients = [
  "from-[#2b0f10] via-[#3b1518] to-[#120a0a]",
  "from-[#2a1410] via-[#3e1b12] to-[#120a0a]",
  "from-[#1f1414] via-[#3a1518] to-[#120a0a]",
  "from-[#241412] via-[#3d1517] to-[#120a0a]",
];

const getGradientClass = (rollNo: string) => {
  const hash = rollNo
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return fallbackGradients[hash % fallbackGradients.length];
};

const getInitials = (first = "", last = "") =>
  `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase();

export default function BrothersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [committeeHeadMap, setCommitteeHeadMap] = useState<
    Record<string, string[]>
  >({});
  const [filter, setFilter] = useState<"Active" | "Alumni" | "Officers">(
    "Active"
  );
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".reveal")).filter(
      (el) => !el.classList.contains("reveal-in")
    );
    if (!elements.length) return;

    if (window.matchMedia("(max-width: 768px)").matches) {
      elements.forEach((el) => el.classList.add("reveal-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [members.length, filter, loading]);

  useEffect(() => {
    async function loadMembers() {
      try {
        const res = await fetch("/api/members");
        if (!res.ok) throw new Error("Failed to load members");
        const data = await res.json();
        setMembers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setMembers([]);
      } finally {
        setLoading(false);
      }
    }

    loadMembers();
  }, []);

  useEffect(() => {
    async function loadCommitteeHeads() {
      try {
        const res = await fetch("/api/committees/public-heads");
        if (!res.ok) throw new Error("Failed to load committee heads");
        const data = await res.json();
        const map: Record<string, string[]> = {};
        (Array.isArray(data) ? data : []).forEach((entry: any) => {
          const rollNo = entry?.head?.rollNo;
          const committeeName = entry?.committeeName;
          if (!rollNo || !committeeName) return;
          if (!map[rollNo]) map[rollNo] = [];
          map[rollNo].push(committeeName);
        });
        setCommitteeHeadMap(map);
      } catch (err) {
        console.error(err);
        setCommitteeHeadMap({});
      }
    }

    loadCommitteeHeads();
  }, []);

  const filteredMembers = useMemo(() => {
    const normalized = members.filter(
      (m) =>
        ["Active", "Alumni"].includes(m.status || "") &&
        m.role !== "superadmin" &&
        !m.isHidden
    );
    const filtered = normalized.filter((member) => {
      if (filter === "Officers") {
        return (
          member.isECouncil ||
          member.isCommitteeHead
        );
      }
      return member.status === filter;
    });
    const searched = query.trim()
      ? filtered.filter((member) => {
          const haystack = `${member.rollNo} ${member.fName} ${member.lName} ${member.majors?.join(" ") ?? ""}`.toLowerCase();
          return haystack.includes(query.trim().toLowerCase());
        })
      : filtered;
    return searched.sort((a, b) => {
      const aNum = Number(String(a.rollNo).replace(/\D/g, "")) || 0;
      const bNum = Number(String(b.rollNo).replace(/\D/g, "")) || 0;
      return aNum - bNum;
    });
  }, [members, filter, query]);

  const executiveBoardPositions = [
    "Regent",
    "Vice Regent",
    "Marshal",
    "Treasurer",
    "Scribe",
    "Corresponding Secretary",
  ];

  const executiveBoardMembers = useMemo(() => {
    if (filter !== "Active") return [];
    const board: Member[] = [];
    executiveBoardPositions.forEach((position) => {
      const member = filteredMembers.find(
        (m) => m.isECouncil && m.ecouncilPosition === position
      );
      if (member) {
        board.push(member);
      }
    });
    return board;
  }, [filteredMembers, filter]);

  const regularActiveMembers = useMemo(() => {
    if (filter !== "Active") return filteredMembers;
    const boardRollNos = new Set(executiveBoardMembers.map((m) => m.rollNo));
    const nonBoardMembers = filteredMembers.filter((m) => !boardRollNos.has(m.rollNo));
    
    // Sort by profile photo presence first, then by roll number
    return nonBoardMembers.sort((a, b) => {
      const aHasPhoto = Boolean(a.profilePicUrl);
      const bHasPhoto = Boolean(b.profilePicUrl);
      
      // If one has photo and other doesn't, prioritize the one with photo
      if (aHasPhoto && !bHasPhoto) return -1;
      if (!aHasPhoto && bHasPhoto) return 1;
      
      // If both have or both don't have photos, sort by roll number
      const aNum = Number(String(a.rollNo).replace(/\D/g, "")) || 0;
      const bNum = Number(String(b.rollNo).replace(/\D/g, "")) || 0;
      return aNum - bNum;
    });
  }, [filteredMembers, filter, executiveBoardMembers]);

  const officersEcouncil = useMemo(() => {
    if (filter !== "Officers") return [];
    return filteredMembers.filter((m) => m.isECouncil);
  }, [filteredMembers, filter]);

  const officersCommitteeHeads = useMemo(() => {
    if (filter !== "Officers") return [];
    return filteredMembers.filter((m) => m.isCommitteeHead && !m.isECouncil);
  }, [filteredMembers, filter]);

  const emptyCopy =
    filter === "Officers"
      ? "No Officers found yet."
      : `No ${filter.toLowerCase()} members found.`;

  const getHeadCommittees = (rollNo: string) =>
    committeeHeadMap[rollNo] || [];

  const handleCardNavigate = (rollNo: string) => {
    router.push(`/brother/${rollNo}`);
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    rollNo: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardNavigate(rollNo);
    }
  };

  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[55vh] w-full">
        <Image
          src="/brothers_1.jpg"
          fill
          priority
          alt="Theta Tau brothers together"
          className="object-cover object-[50%_60%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[55vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Delta Gamma Chapter
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            Brothers
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Meet the members of Theta Tau.
          </p>
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
              Chapter Directory
            </h2>
            <p className="mt-2 text-base text-[#1b0f0f]/75">
              Browse active members, alumni, or chapter officers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full bg-[#120a0a] p-1 text-xs uppercase tracking-[0.3em] text-[#f5d79a]">
              {(["Active", "Alumni", "Officers"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`rounded-full px-4 py-2 transition ${
                    filter === option
                      ? "bg-[#e2ab16] text-[#1b0f0f]"
                      : "text-[#f5d79a] hover:bg-white/10"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#120a0a] bg-[#120a0a] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[#f5d79a]">
              <button
                type="button"
                className="rounded-full border border-[#e2ab16] bg-transparent px-3 py-1 text-[0.62rem] uppercase tracking-[0.28em] text-[#f5d79a] transition hover:bg-[#e2ab16] hover:text-[#120a0a]"
                onClick={() => setShowSearch((v) => !v)}
              >
                Search Members
              </button>
              {showSearch && (
                <input
                  className="w-36 bg-transparent text-xs uppercase tracking-[0.28em] text-[#f5d79a] outline-none placeholder:text-[#f5d79a]/70 sm:w-48"
                  placeholder="Search names..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
            </div>
            <div className="rounded-full bg-[#120a0a] px-6 py-3 text-sm uppercase tracking-[0.3em] text-[#f5d79a]">
              {loading ? "Loading..." : `${filteredMembers.length} brothers`}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 w-full max-w-[1400px] px-6 reveal">
        {loading ? (
          <div className="rounded-[28px] bg-[#1b0f0f] p-10 text-center text-white/80">
            Loading brothers...
          </div>
        ) : (
          <>
            {filter === "Officers" ? (
              <div className="space-y-10">
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className={`${bungee.className} text-2xl text-[#f5d79a]`}>
                      Executive Board
                    </h3>
                    <span className="rounded-full bg-[#1b0f0f] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                      {officersEcouncil.length} members
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {officersEcouncil.map((member, index) => (
                      <div
                        key={member.rollNo}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleCardNavigate(member.rollNo)}
                        onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                        className="group reveal cursor-pointer text-white transition-opacity duration-200 hover:opacity-80"
                        style={{ transitionDelay: `${index * 40}ms` }}
                      >
                        <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "3/4" }}>
                          {member.profilePicUrl ? (
                            <img
                              src={member.profilePicUrl}
                              alt={`${member.fName} ${member.lName}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${getGradientClass(
                                member.rollNo
                              )}`}
                            >
                              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl font-semibold text-white/90">
                                {getInitials(member.fName, member.lName)}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <h3 className="text-base font-semibold text-white">
                            {member.fName} {member.lName}
                          </h3>
                          {member.ecouncilPosition && (
                            <p className="mt-1 text-xs text-[#f5d79a]">
                              {member.ecouncilPosition}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-white/60">
                            #{member.rollNo}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-white/50">
                            {member.socialLinks?.linkedin && (
                              <a
                                href={member.socialLinks.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="LinkedIn"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaLinkedin size={14} />
                              </a>
                            )}
                            {member.socialLinks?.github && (
                              <a
                                href={member.socialLinks.github}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="GitHub"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaGithub size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className={`${bungee.className} text-2xl text-[#f5d79a]`}>
                      Committee Chairs
                    </h3>
                    <span className="rounded-full bg-[#1b0f0f] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                      {officersCommitteeHeads.length} members
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {officersCommitteeHeads.map((member, index) => (
                      <div
                        key={member.rollNo}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleCardNavigate(member.rollNo)}
                        onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                        className="group reveal cursor-pointer text-white transition-opacity duration-200 hover:opacity-80"
                        style={{ transitionDelay: `${index * 40}ms` }}
                      >
                        <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "3/4" }}>
                          {member.profilePicUrl ? (
                            <img
                              src={member.profilePicUrl}
                              alt={`${member.fName} ${member.lName}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${getGradientClass(
                                member.rollNo
                              )}`}
                            >
                              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl font-semibold text-white/90">
                                {getInitials(member.fName, member.lName)}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <h3 className="text-base font-semibold text-white">
                            {member.fName} {member.lName}
                          </h3>
                          {member.isCommitteeHead && (
                            <p className="mt-1 text-xs text-[#f5d79a]">
                              Committee Chair
                            </p>
                          )}
                          <p className="mt-1 text-xs text-white/60">
                            #{member.rollNo}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-white/50">
                            {member.socialLinks?.linkedin && (
                              <a
                                href={member.socialLinks.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="LinkedIn"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaLinkedin size={14} />
                              </a>
                            )}
                            {member.socialLinks?.github && (
                              <a
                                href={member.socialLinks.github}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="GitHub"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaGithub size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : filter === "Active" && executiveBoardMembers.length > 0 ? (
              <div className="space-y-10">
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className={`${bungee.className} text-2xl text-[#f5d79a]`}>
                      Executive Board
                    </h3>
                    <span className="rounded-full bg-[#1b0f0f] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                      {executiveBoardMembers.length} members
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {executiveBoardMembers.map((member, index) => (
                      <div
                        key={member.rollNo}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleCardNavigate(member.rollNo)}
                        onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                        className="group reveal cursor-pointer text-white transition-opacity duration-200 hover:opacity-80"
                        style={{ transitionDelay: `${index * 40}ms` }}
                      >
                        <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "3/4" }}>
                          {member.profilePicUrl ? (
                            <img
                              src={member.profilePicUrl}
                              alt={`${member.fName} ${member.lName}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${getGradientClass(
                                member.rollNo
                              )}`}
                            >
                              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl font-semibold text-white/90">
                                {getInitials(member.fName, member.lName)}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <h3 className="text-base font-semibold text-white">
                            {member.fName} {member.lName}
                          </h3>
                          {member.ecouncilPosition && (
                            <p className="mt-1 text-xs text-[#f5d79a]">
                              {member.ecouncilPosition}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-white/60">
                            #{member.rollNo}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-white/50">
                            {member.socialLinks?.linkedin && (
                              <a
                                href={member.socialLinks.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="LinkedIn"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaLinkedin size={14} />
                              </a>
                            )}
                            {member.socialLinks?.github && (
                              <a
                                href={member.socialLinks.github}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="GitHub"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaGithub size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className={`${bungee.className} text-2xl text-[#f5d79a]`}>
                      Active Members
                    </h3>
                    <span className="rounded-full bg-[#1b0f0f] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                      {regularActiveMembers.length} members
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {regularActiveMembers.map((member, index) => (
                      <div
                        key={member.rollNo}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleCardNavigate(member.rollNo)}
                        onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                        className="group reveal cursor-pointer text-white transition-opacity duration-200 hover:opacity-80"
                        style={{ transitionDelay: `${index * 40}ms` }}
                      >
                        <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "3/4" }}>
                          {member.profilePicUrl ? (
                            <img
                              src={member.profilePicUrl}
                              alt={`${member.fName} ${member.lName}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${getGradientClass(
                                member.rollNo
                              )}`}
                            >
                              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl font-semibold text-white/90">
                                {getInitials(member.fName, member.lName)}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <h3 className="text-base font-semibold text-white">
                            {member.fName} {member.lName}
                          </h3>
                          {member.isECouncil && member.ecouncilPosition && (
                            <p className="mt-1 text-xs text-[#f5d79a]">
                              {member.ecouncilPosition}
                            </p>
                          )}
                          {member.isCommitteeHead && !member.isECouncil && (
                            <p className="mt-1 text-xs text-[#f5d79a]">
                              Committee Chair
                            </p>
                          )}
                          <p className="mt-1 text-xs text-white/60">
                            #{member.rollNo}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-white/50">
                            {member.socialLinks?.linkedin && (
                              <a
                                href={member.socialLinks.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="LinkedIn"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaLinkedin size={14} />
                              </a>
                            )}
                            {member.socialLinks?.github && (
                              <a
                                href={member.socialLinks.github}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="GitHub"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaGithub size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <h3 className={`${bungee.className} text-2xl text-[#f5d79a]`}>
                    {filter === "Alumni" ? "Alumni Members" : "Active Members"}
                  </h3>
                  <span className="rounded-full bg-[#1b0f0f] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                    {filteredMembers.length} members
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredMembers.map((member, index) => (
                  <div
                    key={member.rollNo}
                    role="link"
                    tabIndex={0}
                    onClick={() => handleCardNavigate(member.rollNo)}
                    onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                    className="group reveal cursor-pointer text-white transition-opacity duration-200 hover:opacity-80"
                    style={{ transitionDelay: `${index * 40}ms` }}
                  >
                    <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "3/4" }}>
                      {member.profilePicUrl ? (
                        <img
                          src={member.profilePicUrl}
                          alt={`${member.fName} ${member.lName}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${getGradientClass(
                            member.rollNo
                          )}`}
                        >
                          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl font-semibold text-white/90">
                            {getInitials(member.fName, member.lName)}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3">
                      <h3 className="text-base font-semibold text-white">
                        {member.fName} {member.lName}
                      </h3>
                      {member.isECouncil && member.ecouncilPosition && (
                        <p className="mt-1 text-xs text-[#f5d79a]">
                          {member.ecouncilPosition}
                        </p>
                      )}
                      {member.isCommitteeHead && !member.isECouncil && (
                        <p className="mt-1 text-xs text-[#f5d79a]">
                          Committee Chair
                        </p>
                      )}
                      <p className="mt-1 text-xs text-white/60">
                        #{member.rollNo}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-white/50">
                        {member.socialLinks?.linkedin && (
                          <a
                            href={member.socialLinks.linkedin}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="LinkedIn"
                            className="transition hover:text-[#e2ab16]"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <FaLinkedin size={14} />
                          </a>
                        )}
                        {member.socialLinks?.github && (
                          <a
                            href={member.socialLinks.github}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="GitHub"
                            className="transition hover:text-[#e2ab16]"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <FaGithub size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            )}
          </>
        )}
        {!loading && filteredMembers.length === 0 && (
          <div className="mt-8 rounded-[28px] bg-[#1b0f0f] p-10 text-center text-white/70">
            {emptyCopy}
          </div>
        )}
      </section>
    </main>
  );
}
