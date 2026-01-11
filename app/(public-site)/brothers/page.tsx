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
  const router = useRouter();

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".reveal")).filter(
      (el) => !el.classList.contains("reveal-in")
    );
    if (!elements.length) return;

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
      (m) => ["Active", "Alumni"].includes(m.status || "") && m.role !== "superadmin"
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
    return filtered.sort((a, b) => {
      const aNum = Number(String(a.rollNo).replace(/\D/g, "")) || 0;
      const bNum = Number(String(b.rollNo).replace(/\D/g, "")) || 0;
      return aNum - bNum;
    });
  }, [members, filter]);

  const leadersEcouncil = useMemo(() => {
    if (filter !== "Officers") return [];
    return filteredMembers.filter((m) => m.isECouncil);
  }, [filteredMembers, filter]);

  const leadersCommitteeHeads = useMemo(() => {
    if (filter !== "Officers") return [];
    return filteredMembers.filter((m) => m.isCommitteeHead && !m.isECouncil);
  }, [filteredMembers, filter]);

  const emptyCopy =
    filter === "Officers"
      ? "No leaders found yet."
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
                      E-Council
                    </h3>
                    <span className="rounded-full bg-[#1b0f0f] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                      {leadersEcouncil.length} members
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {leadersEcouncil.map((member, index) => (
                      <div
                        key={member.rollNo}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleCardNavigate(member.rollNo)}
                        onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                        className="group reveal cursor-pointer overflow-hidden rounded-[28px] bg-[#1b0f0f] text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)] ring-1 ring-white/5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
                        style={{ transitionDelay: `${index * 60}ms` }}
                      >
                        <div className="relative h-56 w-full">
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
                              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-semibold text-white/90">
                                {getInitials(member.fName, member.lName)}
                              </div>
                              <span className="mt-3 text-xs uppercase tracking-[0.4em] text-white/70">
                                Theta Tau
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                        </div>
                        <div className="p-6">
                          <p className="text-xs uppercase tracking-[0.35em] text-[#f5d79a]">
                            #{member.rollNo} • {member.status || "Member"}
                          </p>
                          <h3 className={`${bungee.className} mt-3 text-2xl text-[#b3202a]`}>
                            {member.fName} {member.lName}
                          </h3>
                          <p className="mt-2 text-sm text-white/70">
                            {member.majors?.length ? member.majors.join(", ") : "Engineering"}
                          </p>
                          {member.ecouncilPosition && (
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/60">
                              {member.ecouncilPosition}
                            </p>
                          )}
                          {member.gradYear && (
                            <p className="mt-1 text-sm text-white/60">
                              Class of {member.gradYear}
                            </p>
                          )}
                          <div className="mt-4 flex items-center gap-4 text-white/70">
                            {member.socialLinks?.linkedin && (
                              <a
                                href={member.socialLinks.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="LinkedIn"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaLinkedin />
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
                                <FaGithub />
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
                      Committee Heads
                    </h3>
                    <span className="rounded-full bg-[#1b0f0f] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
                      {leadersCommitteeHeads.length} members
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {leadersCommitteeHeads.map((member, index) => (
                      <div
                        key={member.rollNo}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleCardNavigate(member.rollNo)}
                        onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                        className="group reveal cursor-pointer overflow-hidden rounded-[28px] bg-[#1b0f0f] text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)] ring-1 ring-white/5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
                        style={{ transitionDelay: `${index * 60}ms` }}
                      >
                        <div className="relative h-56 w-full">
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
                              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-semibold text-white/90">
                                {getInitials(member.fName, member.lName)}
                              </div>
                              <span className="mt-3 text-xs uppercase tracking-[0.4em] text-white/70">
                                Theta Tau
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                        </div>
                        <div className="p-6">
                          <p className="text-xs uppercase tracking-[0.35em] text-[#f5d79a]">
                            #{member.rollNo} • {member.status || "Member"}
                          </p>
                          <h3 className={`${bungee.className} mt-3 text-2xl text-[#b3202a]`}>
                            {member.fName} {member.lName}
                          </h3>
                          <p className="mt-2 text-sm text-white/70">
                            {member.majors?.length ? member.majors.join(", ") : "Engineering"}
                          </p>
                          {getHeadCommittees(member.rollNo).length > 0 && (
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/60">
                              {getHeadCommittees(member.rollNo).join(", ")}
                            </p>
                          )}
                          {member.gradYear && (
                            <p className="mt-1 text-sm text-white/60">
                              Class of {member.gradYear}
                            </p>
                          )}
                          <div className="mt-4 flex items-center gap-4 text-white/70">
                            {member.socialLinks?.linkedin && (
                              <a
                                href={member.socialLinks.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="LinkedIn"
                                className="transition hover:text-[#e2ab16]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <FaLinkedin />
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
                                <FaGithub />
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
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredMembers.map((member, index) => (
                  <div
                    key={member.rollNo}
                    role="link"
                    tabIndex={0}
                    onClick={() => handleCardNavigate(member.rollNo)}
                    onKeyDown={(event) => handleCardKeyDown(event, member.rollNo)}
                    className="group reveal cursor-pointer overflow-hidden rounded-[28px] bg-[#1b0f0f] text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)] ring-1 ring-white/5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
                    style={{ transitionDelay: `${index * 60}ms` }}
                  >
                    <div className="relative h-56 w-full">
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
                          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-semibold text-white/90">
                            {getInitials(member.fName, member.lName)}
                          </div>
                          <span className="mt-3 text-xs uppercase tracking-[0.4em] text-white/70">
                            Theta Tau
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                    </div>
                    <div className="p-6">
                      <p className="text-xs uppercase tracking-[0.35em] text-[#f5d79a]">
                        #{member.rollNo} • {member.status || "Member"}
                      </p>
                      <h3 className={`${bungee.className} mt-3 text-2xl text-[#b3202a]`}>
                        {member.fName} {member.lName}
                      </h3>
                      <p className="mt-2 text-sm text-white/70">
                        {member.majors?.length ? member.majors.join(", ") : "Engineering"}
                      </p>
                      {getHeadCommittees(member.rollNo).length > 0 && (
                        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/60">
                          {getHeadCommittees(member.rollNo).join(", ")}
                        </p>
                      )}
                      {member.gradYear && (
                        <p className="mt-1 text-sm text-white/60">
                          Class of {member.gradYear}
                        </p>
                      )}
                      <div className="mt-4 flex items-center gap-4 text-white/70">
                        {member.socialLinks?.linkedin && (
                          <a
                            href={member.socialLinks.linkedin}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="LinkedIn"
                            className="transition hover:text-[#e2ab16]"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <FaLinkedin />
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
                            <FaGithub />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
