"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bungee } from "next/font/google";
import { FaGithub, FaLinkedin, FaInstagram, FaGlobe } from "react-icons/fa";

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
  minors?: string[];
  gradYear?: number;
  bio?: string;
  headline?: string;
  pronouns?: string;
  skills?: string[];
  funFacts?: string[];
  projects?: Array<{ title?: string; description?: string; link?: string }>;
  work?: Array<{
    title?: string;
    organization?: string;
    start?: string;
    end?: string;
    description?: string;
    link?: string;
  }>;
  awards?: Array<{
    title?: string;
    issuer?: string;
    date?: string;
    description?: string;
  }>;
  customSections?: Array<{ title?: string; body?: string }>;
  committees?: string[];
  resumeUrl?: string;
  bigs?: Array<string | { fName?: string; lName?: string }>;
  littles?: Array<string | { fName?: string; lName?: string }>;
  hometown?: string;
  familyLine?: string;
  pledgeClass?: string;
  status?: string;
  isECouncil?: boolean;
  isCommitteeHead?: boolean;
  ecouncilPosition?: string;
  profilePicUrl?: string;
  socialLinks?: Record<string, string>;
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

const formatMemberName = (person: string | { fName?: string; lName?: string }) => {
  if (typeof person === "string") return person;
  const name = `${person.fName ?? ""} ${person.lName ?? ""}`.trim();
  return name || "—";
};

export default function BrotherProfile({
  params,
}: {
  params: { rollNo: string };
}) {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headCommittees, setHeadCommittees] = useState<string[]>([]);
  const [memberCommittees, setMemberCommittees] = useState<string[]>([]);
  const skills = (member?.skills || []).filter(Boolean);
  const projects = (member?.projects || []).filter((p) => p?.title || p?.description || p?.link);
  const work = (member?.work || []).filter((w) => w?.title || w?.organization || w?.description);
  const awards = (member?.awards || []).filter((a) => a?.title || a?.issuer || a?.description);
  const funFacts = (member?.funFacts || []).filter(Boolean);
  const customSections = (member?.customSections || []).filter((s) => s?.title || s?.body);
  const bigs = (member?.bigs || []).filter(Boolean);
  const littles = (member?.littles || []).filter(Boolean);
  const fallbackCommittees = (member?.committees || []).filter(
    (committee) => committee && /[A-Za-z]/.test(committee)
  );
  const committees = memberCommittees.length ? memberCommittees : fallbackCommittees;

  useEffect(() => {
    if (loading) return;
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
  }, [loading, member?.rollNo]);

  useEffect(() => {
    async function loadMember() {
      try {
        const res = await fetch(`/api/members/${params.rollNo}`);
        if (!res.ok) {
          throw new Error("Member not found");
        }
        const data = await res.json();
        setMember(data);
      } catch (err: any) {
        setError(err.message || "Unable to load member");
        setMember(null);
      } finally {
        setLoading(false);
      }
    }

    loadMember();
  }, [params.rollNo]);

  useEffect(() => {
    async function loadCommittees() {
      try {
        const res = await fetch(`/api/committees/public-member/${params.rollNo}`);
        if (!res.ok) {
          throw new Error("Committee fetch failed");
        }
        const data = await res.json();
        setHeadCommittees(Array.isArray(data?.headCommittees) ? data.headCommittees : []);
        setMemberCommittees(Array.isArray(data?.memberCommittees) ? data.memberCommittees : []);
      } catch (err) {
        console.error(err);
        setHeadCommittees([]);
        setMemberCommittees([]);
      }
    }

    loadCommittees();
  }, [params.rollNo]);

  if (loading) {
    return (
      <main className="bg-[#120a0a] pb-16 text-white">
        <section className="mx-auto mt-20 w-full max-w-4xl rounded-[36px] bg-[#1b0f0f] px-8 py-12 text-center">
          Loading profile...
        </section>
      </main>
    );
  }

  if (error || !member) {
    return (
      <main className="bg-[#120a0a] pb-16 text-white">
        <section className="mx-auto mt-20 w-full max-w-4xl rounded-[36px] bg-[#1b0f0f] px-8 py-12 text-center">
          <p className="text-lg text-white/80">{error || "Profile unavailable"}</p>
          <Link href="/brothers" className="tt-button-secondary mt-6 inline-flex">
            Back to brothers
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-[#120a0a] pb-16 text-white">
      <section className="relative min-h-[50vh] w-full">
        <Image
          src="/everyone.jpg"
          fill
          priority
          alt="Theta Tau chapter backdrop"
          className="object-cover object-[90%_55%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/60 to-[#120a0a]" />
        <div className="relative z-10 flex min-h-[50vh] flex-col items-start justify-end px-6 pb-12 sm:px-12">
          <p className="text-sm uppercase tracking-[0.35em] text-[#f5d79a]">
            Brother Profile
          </p>
          <h1 className={`${bungee.className} mt-3 text-4xl text-[#b3202a] sm:text-6xl`}>
            {member.fName} {member.lName}
          </h1>
          {member.headline ? (
            <p className="mt-4 max-w-2xl text-lg text-white/85">
              {member.headline}
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-lg text-white/85">
              {member.majors?.length ? member.majors.join(", ") : "Engineering"}
            </p>
          )}
          {member.pronouns && (
            <span className="mt-3 inline-flex rounded-full bg-white/15 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white">
              {member.pronouns}
            </span>
          )}
        </div>
      </section>

      <section className="mx-4 mt-12 rounded-[36px] bg-[#fbf6dc] px-8 py-12 text-[#1b0f0f] lg:mx-10 reveal">
        <div className="grid gap-10 lg:grid-cols-[0.9fr,1.1fr]">
          <div className="rounded-[28px] bg-[#120a0a] p-6 text-white shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
            <div className="overflow-hidden rounded-[22px] bg-black/30">
              {member.profilePicUrl ? (
                <img
                  src={member.profilePicUrl}
                  alt={`${member.fName} ${member.lName}`}
                  className="h-[360px] w-full object-cover"
                />
              ) : (
                <div
                  className={`flex h-[360px] w-full flex-col items-center justify-center bg-gradient-to-br ${getGradientClass(
                    member.rollNo
                  )}`}
                >
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/10 text-4xl font-semibold text-white/90">
                    {getInitials(member.fName, member.lName)}
                  </div>
                  <span className="mt-3 text-xs uppercase tracking-[0.4em] text-white/70">
                    Theta Tau
                  </span>
                </div>
              )}
            </div>
            <div className="mt-6 space-y-5">
              <p className="text-base uppercase tracking-[0.35em] text-[#f5d79a]">
                #{member.rollNo} • {member.status || "Member"}
              </p>
              {member.gradYear && (
                <p className="text-lg text-white/90">Class of {member.gradYear}</p>
              )}
              {member.hometown && (
                <p className="text-lg text-white/80">Hometown: {member.hometown}</p>
              )}
              {member.familyLine && (
                <p className="text-lg text-white/80">Family Line: {member.familyLine}</p>
              )}
              {member.pledgeClass && (
                <p className="text-lg text-white/80">Pledge Class: {member.pledgeClass}</p>
              )}
              {member.isCommitteeHead && (
                <p className="text-lg text-white/85">
                  Committee Head
                  {headCommittees.length ? `: ${headCommittees.join(", ")}` : ": —"}
                </p>
              )}
              {member.isECouncil && member.ecouncilPosition && (
                <p className="text-lg text-white/85">E-Council: {member.ecouncilPosition}</p>
              )}
              {member.isECouncil && !member.ecouncilPosition && (
                <p className="text-lg text-white/85">E-Council</p>
              )}
              {committees.length > 0 && (
                <div className="pt-2">
                  <p className="text-sm uppercase tracking-[0.25em] text-white/60">
                    Committees
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {committees.map((committee) => (
                      <span
                        key={committee}
                        className="rounded-full border border-white/15 px-4 py-1.5 text-sm uppercase tracking-[0.22em] text-white/85"
                      >
                        {committee}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-8 flex items-center gap-6 text-2xl text-white/90">
              {member.socialLinks?.linkedin && (
                <a
                  href={member.socialLinks.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="LinkedIn"
                  className="transition hover:text-[#e2ab16]"
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
                >
                  <FaGithub />
                </a>
              )}
              {member.socialLinks?.instagram && (
                <a
                  href={member.socialLinks.instagram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="transition hover:text-[#e2ab16]"
                >
                  <FaInstagram />
                </a>
              )}
              {member.socialLinks?.website && (
                <a
                  href={member.socialLinks.website}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Website"
                  className="transition hover:text-[#e2ab16]"
                >
                  <FaGlobe />
                </a>
              )}
            </div>
          </div>

          <div>
            <div className="rounded-[28px] bg-white p-8 shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
              <h2 className={`${bungee.className} text-3xl text-[#7a0104]`}>
                Professional Bio
              </h2>
              <p className="mt-4 text-lg text-[#1b0f0f]/80">
                {member.bio && member.bio.trim().length > 0
                  ? member.bio
                  : "This member is building their story. Check back soon for a full bio."}
              </p>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-[24px] bg-[#120a0a] p-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                <h3 className={`${bungee.className} text-xl text-[#b3202a]`}>
                  Academics
                </h3>
                <p className="mt-3 text-sm text-white/75">
                  {member.majors?.length
                    ? member.majors.join(", ")
                    : "Engineering"}
                </p>
                {member.minors?.length ? (
                  <p className="mt-2 text-sm text-white/60">
                    Minors: {member.minors.join(", ")}
                  </p>
                ) : null}
                {member.gradYear && (
                  <p className="mt-2 text-sm text-white/60">
                    Class of {member.gradYear}
                  </p>
                )}
              </div>

              <div className="rounded-[24px] bg-[#120a0a] p-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                <h3 className={`${bungee.className} text-xl text-[#b3202a]`}>
                  Fraternity
                </h3>
                <p className="mt-3 text-sm text-white/75">
                  {member.familyLine ? `Family Line: ${member.familyLine}` : "Family Line: —"}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  {member.pledgeClass ? `Pledge Class: ${member.pledgeClass}` : "Pledge Class: —"}
                </p>
                {member.isECouncil && member.ecouncilPosition && (
                  <p className="mt-2 text-sm text-white/60">
                    E-Council: {member.ecouncilPosition}
                  </p>
                )}
              </div>
            </div>

            {(bigs.length > 0 || littles.length > 0 || committees.length > 0) && (
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="rounded-[24px] bg-[#120a0a] p-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                  <h3 className={`${bungee.className} text-xl text-[#b3202a]`}>
                    Lineage
                  </h3>
                  {bigs.length > 0 ? (
                    <p className="mt-3 text-sm text-white/75">
                      Big{bigs.length > 1 ? "s" : ""}:{" "}
                      {bigs.map((b) => formatMemberName(b)).join(", ")}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-white/60">Bigs: —</p>
                  )}
                  {littles.length > 0 ? (
                    <p className="mt-2 text-sm text-white/70">
                      Little{littles.length > 1 ? "s" : ""}:{" "}
                      {littles.map((l) => formatMemberName(l)).join(", ")}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-white/60">Littles: —</p>
                  )}
                </div>
                <div className="rounded-[24px] bg-[#120a0a] p-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                  <h3 className={`${bungee.className} text-xl text-[#b3202a]`}>
                    Committees
                  </h3>
                  {committees.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {committees.map((committee) => (
                        <span
                          key={committee}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80"
                        >
                          {committee}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-white/60">No committees listed.</p>
                  )}
                </div>
              </div>
            )}

            {skills.length > 0 && (
              <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1b0f0f] shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <h3 className={`${bungee.className} text-xl text-[#7a0104]`}>
                  Skills
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {skills.map((skill, idx) => (
                    <span
                      key={`${skill}-${idx}`}
                      className="rounded-full bg-[#120a0a] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#f5d79a]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {projects.length > 0 && (
              <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1b0f0f] shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <h3 className={`${bungee.className} text-xl text-[#7a0104]`}>
                  Projects
                </h3>
                <div className="mt-4 space-y-4">
                  {projects.map((project, idx) => (
                    <div key={`project-${idx}`} className="rounded-[18px] bg-[#fbf6dc] p-4">
                      <div className="text-base font-semibold">{project.title || "Project"}</div>
                      {project.description && (
                        <p className="mt-2 text-sm text-[#1b0f0f]/80">{project.description}</p>
                      )}
                      {project.link && (
                        <a
                          href={project.link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-sm text-[#7a0104] underline underline-offset-4"
                        >
                          {project.link}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {work.length > 0 && (
              <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1b0f0f] shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <h3 className={`${bungee.className} text-xl text-[#7a0104]`}>
                  Work & Internships
                </h3>
                <div className="mt-4 space-y-4">
                  {work.map((item, idx) => (
                    <div key={`work-${idx}`} className="rounded-[18px] bg-[#fbf6dc] p-4">
                      <div className="text-base font-semibold">
                        {item.title || "Role"}
                        {item.organization ? ` • ${item.organization}` : ""}
                      </div>
                      {(item.start || item.end) && (
                        <div className="mt-1 text-sm text-[#1b0f0f]/70">
                          {[item.start, item.end].filter(Boolean).join(" - ")}
                        </div>
                      )}
                      {item.description && (
                        <p className="mt-2 text-sm text-[#1b0f0f]/80">{item.description}</p>
                      )}
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-sm text-[#7a0104] underline underline-offset-4"
                        >
                          {item.link}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {awards.length > 0 && (
              <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1b0f0f] shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <h3 className={`${bungee.className} text-xl text-[#7a0104]`}>
                  Awards & Certifications
                </h3>
                <div className="mt-4 space-y-4">
                  {awards.map((award, idx) => (
                    <div key={`award-${idx}`} className="rounded-[18px] bg-[#fbf6dc] p-4">
                      <div className="text-base font-semibold">
                        {award.title || "Award"}
                        {award.issuer ? ` • ${award.issuer}` : ""}
                      </div>
                      {award.date && (
                        <div className="mt-1 text-sm text-[#1b0f0f]/70">{award.date}</div>
                      )}
                      {award.description && (
                        <p className="mt-2 text-sm text-[#1b0f0f]/80">{award.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {funFacts.length > 0 && (
              <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1b0f0f] shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <h3 className={`${bungee.className} text-xl text-[#7a0104]`}>
                  Fun Facts
                </h3>
                <ul className="mt-4 space-y-2 text-sm text-[#1b0f0f]/80">
                  {funFacts.map((fact, idx) => (
                    <li key={`fact-${idx}`}>• {fact}</li>
                  ))}
                </ul>
              </div>
            )}

            {customSections.length > 0 && (
              <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1b0f0f] shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <h3 className={`${bungee.className} text-xl text-[#7a0104]`}>
                  More
                </h3>
                <div className="mt-4 space-y-4">
                  {customSections.map((section, idx) => (
                    <div key={`section-${idx}`} className="rounded-[18px] bg-[#fbf6dc] p-4">
                      <div className="text-base font-semibold">
                        {section.title || "Section"}
                      </div>
                      {section.body && (
                        <p className="mt-2 text-sm text-[#1b0f0f]/80">{section.body}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1b0f0f] shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
              <h3 className={`${bungee.className} text-xl text-[#7a0104]`}>
                Resume
              </h3>
              {member.resumeUrl ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a
                    href={member.resumeUrl}
                    className="tt-button-secondary"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download resume
                  </a>
                  <span className="text-sm text-[#1b0f0f]/70">
                    Updated resume available for viewing.
                  </span>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#1b0f0f]/70">
                  Resume not yet shared.
                </p>
              )}
            </div>

            <Link href="/brothers" className="tt-button-secondary mt-8 inline-flex">
              Back to brothers
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
