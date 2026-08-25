// app/(members-only)/member/profile/[rollNo]/ProfileClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberDoc } from "@/types/member";
import ProfileInfoEditor, {
  type ProfileEditorSection,
} from "./ProfileInfoEditor";
import PhotoUploader from "./PhotoUploader";
import ResumeUploader from "./ResumeUploader";
import ConnectWithDiscordButton from "@/components/ConnectWithDiscordButton";
import {
  Camera,
  Download,
  Eye,
  ExternalLink,
  Pencil,
  Plus,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoadingState from "../../../components/LoadingState";
import { PageContainer } from "../../../components/shell/PageShell";
import {
  DetailRow,
  EntryItem,
  Section,
  Stat,
} from "../../../components/shell/ProfileSections";
import { cn } from "@/lib/utils";

interface ProfileClientProps {
  member: MemberDoc;
  committees: { name: string }[];
}

const EDITOR_COPY: Record<
  ProfileEditorSection,
  { title: string; description: string }
> = {
  basics: {
    title: "Edit profile",
    description: "Update your core chapter and personal details.",
  },
  links: {
    title: "Edit profile links",
    description: "Add the places brothers can find your work online.",
  },
  skills: {
    title: "Edit skills",
    description: "Share the tools, disciplines, and strengths you bring.",
  },
  funFacts: {
    title: "Edit fun facts",
    description: "Add a few memorable details about yourself.",
  },
  projects: {
    title: "Edit projects",
    description: "Add or update work you are proud to showcase.",
  },
  work: {
    title: "Edit work and internships",
    description: "Add or update your professional experience.",
  },
  awards: {
    title: "Edit awards and certifications",
    description: "Add or update honors, credentials, and accomplishments.",
  },
  customSections: {
    title: "Edit custom sections",
    description: "Add anything else that belongs on your profile.",
  },
};

export default function ProfileClient({
  member,
  committees,
}: ProfileClientProps) {
  const [editingSection, setEditingSection] =
    useState<ProfileEditorSection | null>(null);
  const [showPicModal, setShowPicModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const router = useRouter();

  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return <LoadingState message="Loading profile..." />;
  }

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <X aria-hidden="true" />
          <AlertDescription>
            You must be logged in to use this function.
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  // Only allow editing if this is the logged-in user's profile
  const canEdit = isSignedIn && user && user.id === member.clerkId;
  const skills = (member.skills || []).filter(Boolean);
  const projects = (member.projects || []).filter(
    (p) => p?.title || p?.description || p?.link
  );
  const work = (member.work || []).filter(
    (w) => w?.title || w?.organization || w?.description
  );
  const awards = (member.awards || []).filter(
    (a) => a?.title || a?.issuer || a?.description
  );
  const funFacts = (member.funFacts || []).filter(Boolean);
  const customSections = (member.customSections || []).filter(
    (s) => s?.title || s?.body
  );
  const profileLinks = [
    { label: "GitHub", href: member.socialLinks?.github },
    { label: "LinkedIn", href: member.socialLinks?.linkedin },
    { label: "Instagram", href: member.socialLinks?.instagram },
    { label: "Website", href: member.socialLinks?.website },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  const initials = `${member.fName?.[0] ?? ""}${member.lName?.[0] ?? ""}`.toUpperCase();

  return (
    <PageContainer className="space-y-6">
      {/* ── Identity header ── */}
      <section className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-3">
          <Avatar className="size-28 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
            {member.profilePicUrl ? (
              <AvatarImage
                src={member.profilePicUrl}
                alt={`${member.fName} ${member.lName}`}
              />
            ) : null}
            <AvatarFallback className="text-2xl font-semibold">
              {initials || <UserCircle2 className="size-10" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPicModal(true)}
            >
              <Camera aria-hidden="true" />
              Edit Photo
            </Button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {member.fName} {member.lName}
              </h1>
              {member.headline && (
                <p className="text-base text-foreground/80">
                  {member.headline}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {member.hometown && <span>{member.hometown}</span>}
                {member.pronouns && (
                  <Badge variant="outline">{member.pronouns}</Badge>
                )}
              </div>
            </div>

            {canEdit && (
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => setEditingSection("basics")}
                >
                  <Pencil aria-hidden="true" />
                  Edit Profile
                </Button>
                {!member.discordId && <ConnectWithDiscordButton />}
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Roll No" value={`#${member.rollNo}`} />
            <Stat label="Status" value={member.status} />
            <Stat label="Family Line" value={member.familyLine} />
            <Stat label="Pledge Class" value={member.pledgeClass} />
          </dl>

        </div>
      </section>

      {/* ── Content ──
       * One flowing grid rather than two fixed columns: a member with little
       * filled in would otherwise leave a tall empty void beside the sidebar.
       * Wide sections span both tracks; compact ones pair up. */}
      <div className="grid gap-6 md:grid-cols-2">
        <Section
          title="About"
          className="md:col-span-2"
          action={
            canEdit ? (
              <SectionEditButton
                onClick={() => setEditingSection("basics")}
              />
            ) : null
          }
        >
          {member.bio ? (
            <p className="text-sm leading-relaxed text-foreground/90">
              {member.bio}
            </p>
          ) : canEdit ? (
            <AddPrompt
              text="Share your story to personalize your profile."
              onAdd={() => setEditingSection("basics")}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No bio yet.
            </p>
          )}
        </Section>

        {profileLinks.length > 0 ? (
          <Section
            title="Links"
            action={
              canEdit ? (
                <SectionEditButton
                  onClick={() => setEditingSection("links")}
                />
              ) : null
            }
          >
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
                  </a>
                </Button>
              ))}
            </div>
          </Section>
        ) : canEdit ? (
          <Section title="Links">
            <AddPrompt
              text="Add links to your work and social profiles."
              onAdd={() => setEditingSection("links")}
            />
          </Section>
        ) : null}

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
              <DetailRow
                label="Pledge Class"
                value={member.pledgeClass || "Not set"}
              />
              {member.bigs?.length > 0 && (
                <DetailRow
                  label={`Big${member.bigs.length > 1 ? "s" : ""}`}
                  value={member.bigs
                    .map((b: any) =>
                      typeof b === "string"
                        ? b
                        : `${b.fName ?? ""} ${b.lName ?? ""}`.trim()
                    )
                    .join(", ")}
                />
              )}
              {member.littles?.length > 0 && (
                <DetailRow
                  label={`Little${member.littles.length > 1 ? "s" : ""}`}
                  value={member.littles
                    .map((l: any) =>
                      typeof l === "string"
                        ? l
                        : `${l.fName ?? ""} ${l.lName ?? ""}`.trim()
                    )
                    .join(", ")}
                />
              )}
            </dl>
          </Section>

          {skills.length > 0 ? (
            <Section
              title="Skills"
              action={
                canEdit ? (
                  <SectionEditButton
                    onClick={() => setEditingSection("skills")}
                  />
                ) : null
              }
            >
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, idx) => (
                  <Badge key={`${skill}-${idx}`} variant="muted">
                    {skill}
                  </Badge>
                ))}
              </div>
            </Section>
          ) : canEdit ? (
            <Section title="Skills">
              <AddPrompt
                text="Add the skills you want brothers to know about."
                onAdd={() => setEditingSection("skills")}
              />
            </Section>
          ) : null}

          {funFacts.length > 0 ? (
            <Section
              title="Fun Facts"
              action={
                canEdit ? (
                  <SectionEditButton
                    onClick={() => setEditingSection("funFacts")}
                  />
                ) : null
              }
            >
              <ul className="list-inside list-disc space-y-1 text-sm text-foreground/90">
                {funFacts.map((fact, idx) => (
                  <li key={`fact-${idx}`}>{fact}</li>
                ))}
              </ul>
            </Section>
          ) : canEdit ? (
            <Section title="Fun Facts">
              <AddPrompt
                text="Something memorable about you."
                onAdd={() => setEditingSection("funFacts")}
              />
            </Section>
          ) : null}

          <Section title="Résumé">
            {member.resumeUrl ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={member.resumeUrl} download className="no-underline">
                    <Download aria-hidden="true" />
                    Download
                  </a>
                </Button>
                {canEdit && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreviewModal(true)}
                    >
                      <Eye aria-hidden="true" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResumeModal(true)}
                    >
                      <Upload aria-hidden="true" />
                      Upload New
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Alert variant="warning">
                  <Upload aria-hidden="true" />
                  <AlertDescription>
                    {canEdit
                      ? "You haven’t uploaded a résumé yet."
                      : "No résumé uploaded yet."}
                  </AlertDescription>
                </Alert>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResumeModal(true)}
                  >
                    <Upload aria-hidden="true" />
                    Upload Résumé
                  </Button>
                )}
              </div>
            )}
          </Section>

        {/* Wide narrative sections — rendered when present, or as a completion
         * prompt for the profile owner. */}
        {projects.length > 0 ? (
          <Section
            title="Projects"
            className="md:col-span-2"
            action={
              canEdit ? (
                <SectionEditButton
                  onClick={() => setEditingSection("projects")}
                />
              ) : null
            }
          >
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
        ) : canEdit ? (
          <Section title="Projects">
            <AddPrompt
              text="Showcase what you've built."
              onAdd={() => setEditingSection("projects")}
            />
          </Section>
        ) : null}

        {work.length > 0 ? (
          <Section
            title="Work & Internships"
            className="md:col-span-2"
            action={
              canEdit ? (
                <SectionEditButton
                  onClick={() => setEditingSection("work")}
                />
              ) : null
            }
          >
            <ul className="grid gap-4 sm:grid-cols-2">
              {work.map((item, idx) => (
                <EntryItem
                  key={`work-${idx}`}
                  title={`${item.title || "Role"}${
                    item.organization ? ` · ${item.organization}` : ""
                  }`}
                  meta={[item.start, item.end].filter(Boolean).join(" – ")}
                  description={item.description}
                  link={item.link}
                />
              ))}
            </ul>
          </Section>
        ) : canEdit ? (
          <Section title="Work & Internships">
            <AddPrompt
              text="Add roles and internships you've held."
              onAdd={() => setEditingSection("work")}
            />
          </Section>
        ) : null}

        {awards.length > 0 ? (
          <Section
            title="Awards & Certifications"
            className="md:col-span-2"
            action={
              canEdit ? (
                <SectionEditButton
                  onClick={() => setEditingSection("awards")}
                />
              ) : null
            }
          >
            <ul className="grid gap-4 sm:grid-cols-2">
              {awards.map((award, idx) => (
                <EntryItem
                  key={`award-${idx}`}
                  title={`${award.title || "Award"}${
                    award.issuer ? ` · ${award.issuer}` : ""
                  }`}
                  meta={award.date}
                  description={award.description}
                />
              ))}
            </ul>
          </Section>
        ) : canEdit ? (
          <Section title="Awards & Certifications">
            <AddPrompt
              text="List awards and certifications you've earned."
              onAdd={() => setEditingSection("awards")}
            />
          </Section>
        ) : null}

        {customSections.length > 0 ? (
          <Section
            title="More"
            className="md:col-span-2"
            action={
              canEdit ? (
                <SectionEditButton
                  onClick={() => setEditingSection("customSections")}
                />
              ) : null
            }
          >
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
        ) : canEdit ? (
          <Section title="More">
            <AddPrompt
              text="Create a custom section for anything else you want to share."
              onAdd={() => setEditingSection("customSections")}
            />
          </Section>
        ) : null}
      </div>

      {/* ── MODALS ── */}
      <PhotoUploader
        show={showPicModal}
        initialUrl={member.profilePicUrl}
        onClose={() => setShowPicModal(false)}
        onError={(msg) => console.error(msg)}
      />

      <ResumeUploader
        show={showResumeModal}
        initialUrl={member.resumeUrl}
        onClose={() => setShowResumeModal(false)}
        onError={(msg) => console.error(msg)}
      />

      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
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
                Unable to display PDF.{" "}
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

      {canEdit && editingSection && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingSection(null);
          }}
        >
          <DialogContent
            className={cn(
              "grid max-h-[92dvh] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0",
              editingSection === "basics" ? "max-w-5xl" : "max-w-3xl"
            )}
          >
            <DialogHeader className="border-b border-border px-6 py-5 pr-12">
              <DialogTitle>{EDITOR_COPY[editingSection].title}</DialogTitle>
              <DialogDescription>
                {EDITOR_COPY[editingSection].description}
              </DialogDescription>
            </DialogHeader>
            <ProfileInfoEditor
              key={editingSection}
              member={member}
              section={editingSection}
              onCancel={() => setEditingSection(null)}
              onDone={() => {
                setEditingSection(null);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  );
}

/* ---------------- presentational helpers ---------------- */



/** Prompt shown to the profile owner for a section they haven't filled in yet.
 *  Keeps the page from reading as empty and nudges profile completion. */
function AddPrompt({
  text,
  onAdd,
}: {
  text: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border px-4 py-5">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus aria-hidden="true" />
        Add
      </Button>
    </div>
  );
}

function SectionEditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <Pencil aria-hidden="true" />
      Edit
    </Button>
  );
}


