"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { CircleAlert, Loader2, Save } from "lucide-react";
import type { MemberDoc } from "@/types/member";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CollectionCard,
  CollectionItem,
  Field,
} from "../../../components/shell/FormSections";

const PLEDGE_CLASS_OPTIONS = [
  "Zeta Gamma",
  "Eta Gamma",
  "Theta Gamma",
  "Iota Gamma",
  "Kappa Gamma",
  "Lambda Gamma",
  "Mu Gamma",
  "Nu Gamma",
  "Xi Gamma",
  "Omicron Gamma",
  "Pi Gamma",
  "Rho Gamma",
  "Sigma Gamma",
  "Tau Gamma",
  "Upsilon Gamma",
  "Phi Gamma",
  "Chi Gamma",
  "Psi Gamma",
  "Omega Gamma",
];

const resolveRollNo = (entry: any) => {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  if (typeof entry.rollNo === "string") return entry.rollNo;
  if (entry.memberId) {
    if (typeof entry.memberId === "string") return entry.memberId;
    if (Array.isArray(entry.memberId) && entry.memberId.length) {
      return typeof entry.memberId[0] === "string"
        ? entry.memberId[0]
        : entry.memberId[0]?.rollNo || "";
    }
    if (typeof entry.memberId.rollNo === "string") return entry.memberId.rollNo;
  }
  return "";
};

type ProjectItem = { title: string; description: string; link: string };
type WorkItem = {
  title: string;
  organization: string;
  start: string;
  end: string;
  description: string;
  link: string;
};
type AwardItem = {
  title: string;
  issuer: string;
  date: string;
  description: string;
};
type CustomSection = { title: string; body: string };
type ArrayKey = "projects" | "work" | "awards" | "customSections";
export type ProfileEditorSection =
  | "basics"
  | "links"
  | "skills"
  | "funFacts"
  | "projects"
  | "work"
  | "awards"
  | "customSections";

export default function ProfileInfoEditor({
  member,
  section,
  onDone,
  onCancel,
}: {
  member: MemberDoc;
  section: ProfileEditorSection;
  onDone: () => void;
  onCancel: () => void;
}) {
  const socials = member.socialLinks || {};
  const [form, setForm] = useState({
    headline: member.headline || "",
    pronouns: member.pronouns || "",
    majors: member.majors.join(", "),
    minors: member.minors?.join(", ") || "",
    gradYear: member.gradYear?.toString() || "",
    bio: member.bio || "",
    hometown: member.hometown || "",
    pledgeClass: member.pledgeClass || "",
    big: resolveRollNo(member.bigs?.[0]),
    littles: (member.littles || [])
      .map((entry) => resolveRollNo(entry))
      .filter(Boolean)
      .join(", "),
    skills: (member.skills || []).join("\n"),
    funFacts: (member.funFacts || []).join("\n"),
    github: socials.github || "",
    linkedin: socials.linkedin || "",
    instagram: socials.instagram || "",
    website: socials.website || "",
    projects: (member.projects || []).map((project) => ({
      title: project.title || "",
      description: project.description || "",
      link: project.link || "",
    })),
    work: (member.work || []).map((item) => ({
      title: item.title || "",
      organization: item.organization || "",
      start: item.start || "",
      end: item.end || "",
      description: item.description || "",
      link: item.link || "",
    })),
    awards: (member.awards || []).map((award) => ({
      title: award.title || "",
      issuer: award.issuer || "",
      date: award.date || "",
      description: award.description || "",
    })),
    customSections: (member.customSections || []).map((section) => ({
      title: section.title || "",
      body: section.body || "",
    })),
  });
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateField = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const updateArrayItem = <T, K extends keyof T>(
    key: ArrayKey,
    index: number,
    field: K,
    value: string
  ) =>
    setForm((current) => {
      const copy = [...(current[key] as T[])];
      copy[index] = { ...copy[index], [field]: value };
      return { ...current, [key]: copy };
    });

  const addArrayItem = (key: ArrayKey) =>
    setForm((current) => {
      const empty =
        key === "projects"
          ? { title: "", description: "", link: "" }
          : key === "work"
          ? {
              title: "",
              organization: "",
              start: "",
              end: "",
              description: "",
              link: "",
            }
          : key === "awards"
          ? { title: "", issuer: "", date: "", description: "" }
          : { title: "", body: "" };
      return { ...current, [key]: [...(current[key] as any[]), empty] };
    });

  const removeArrayItem = (key: ArrayKey, index: number) =>
    setForm((current) => {
      const copy = [...(current[key] as any[])];
      copy.splice(index, 1);
      return { ...current, [key]: copy };
    });

  const parseList = (text: string) =>
    text
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setSaveError(null);

    const payloadBySection: Record<
      ProfileEditorSection,
      Record<string, unknown>
    > = {
      basics: {
        headline: form.headline.trim(),
        pronouns: form.pronouns.trim(),
        majors: parseList(form.majors),
        minors: parseList(form.minors),
        gradYear: Number(form.gradYear),
        bio: form.bio,
        hometown: form.hometown,
        pledgeClass: form.pledgeClass.trim(),
        bigs: form.big ? [form.big.trim()] : [],
        littles: parseList(form.littles).slice(0, 5),
      },
      links: {
        socialLinks: {
          github: form.github.trim(),
          linkedin: form.linkedin.trim(),
          instagram: form.instagram.trim(),
          website: form.website.trim(),
        },
      },
      skills: { skills: parseList(form.skills) },
      funFacts: { funFacts: parseList(form.funFacts) },
      projects: { projects: form.projects },
      work: { work: form.work },
      awards: { awards: form.awards },
      customSections: { customSections: form.customSections },
    };

    try {
      const response = await fetch("/api/members/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBySection[section]),
      });
      if (!response.ok) {
        throw new Error("Your profile could not be saved. Please try again.");
      }
      onDone();
    } catch (error) {
      console.error(error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Your profile could not be saved. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {section === "basics" && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle role="heading" aria-level={3} className="text-base">
              Profile basics
            </CardTitle>
            <CardDescription>
              The details brothers will see first on your profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <Field id="profile-headline" label="Headline or tagline" className="lg:col-span-8">
              <Input
                id="profile-headline"
                value={form.headline}
                onChange={(event) => updateField("headline", event.target.value)}
                placeholder="Aspiring robotics engineer • Project lead"
              />
            </Field>
            <Field id="profile-pronouns" label="Pronouns" className="lg:col-span-4">
              <Input
                id="profile-pronouns"
                value={form.pronouns}
                onChange={(event) => updateField("pronouns", event.target.value)}
                placeholder="he/him, she/her, they/them"
              />
            </Field>

            <Field
              id="profile-majors"
              label="Majors"
              hint="Separate multiple majors with commas."
              className="lg:col-span-6"
            >
              <Input
                id="profile-majors"
                aria-describedby="profile-majors-hint"
                value={form.majors}
                onChange={(event) => updateField("majors", event.target.value)}
              />
            </Field>
            <Field
              id="profile-minors"
              label="Minors"
              hint="Separate multiple minors with commas."
              className="lg:col-span-6"
            >
              <Input
                id="profile-minors"
                aria-describedby="profile-minors-hint"
                value={form.minors}
                onChange={(event) => updateField("minors", event.target.value)}
              />
            </Field>

            <Field id="profile-grad-year" label="Graduation year" className="lg:col-span-4">
              <Input
                id="profile-grad-year"
                type="number"
                inputMode="numeric"
                value={form.gradYear}
                onChange={(event) => updateField("gradYear", event.target.value)}
              />
            </Field>
            <Field id="profile-pledge-class" label="Pledge class" className="lg:col-span-4">
              <Select
                value={form.pledgeClass}
                onValueChange={(value) => updateField("pledgeClass", value)}
              >
                <SelectTrigger id="profile-pledge-class">
                  <SelectValue placeholder="Select pledge class" />
                </SelectTrigger>
                <SelectContent>
                  {PLEDGE_CLASS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="profile-hometown" label="Hometown" className="lg:col-span-4">
              <Input
                id="profile-hometown"
                value={form.hometown}
                onChange={(event) => updateField("hometown", event.target.value)}
                placeholder="Tempe, AZ"
              />
            </Field>

            <Field id="profile-big" label="Big’s roll number" className="lg:col-span-6">
              <Input
                id="profile-big"
                inputMode="numeric"
                value={form.big}
                onChange={(event) => updateField("big", event.target.value)}
                placeholder="e.g. 12345"
              />
            </Field>
            <Field
              id="profile-littles"
              label="Littles’ roll numbers"
              hint="Enter up to five, separated with commas."
              className="lg:col-span-6"
            >
              <Input
                id="profile-littles"
                aria-describedby="profile-littles-hint"
                value={form.littles}
                onChange={(event) => updateField("littles", event.target.value)}
                placeholder="e.g. 54321, 67890"
              />
            </Field>

            <Field id="profile-bio" label="Bio" className="sm:col-span-2 lg:col-span-12">
              <Textarea
                id="profile-bio"
                rows={4}
                value={form.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="Share your story, interests, or what you're working on."
              />
            </Field>
          </CardContent>
        </Card>
        )}

        {section === "links" && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle role="heading" aria-level={3} className="text-base">
              Profile links
            </CardTitle>
            <CardDescription>
              Help brothers find your work and connect with you elsewhere.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="profile-github" label="GitHub URL">
              <Input
                id="profile-github"
                inputMode="url"
                value={form.github}
                onChange={(event) => updateField("github", event.target.value)}
                placeholder="https://github.com/username"
              />
            </Field>
            <Field id="profile-linkedin" label="LinkedIn URL">
              <Input
                id="profile-linkedin"
                inputMode="url"
                value={form.linkedin}
                onChange={(event) => updateField("linkedin", event.target.value)}
                placeholder="https://linkedin.com/in/username"
              />
            </Field>
            <Field id="profile-instagram" label="Instagram URL">
              <Input
                id="profile-instagram"
                inputMode="url"
                value={form.instagram}
                onChange={(event) => updateField("instagram", event.target.value)}
                placeholder="https://instagram.com/username"
              />
            </Field>
            <Field id="profile-website" label="Personal website">
              <Input
                id="profile-website"
                inputMode="url"
                value={form.website}
                onChange={(event) => updateField("website", event.target.value)}
                placeholder="https://your-site.com"
              />
            </Field>
          </CardContent>
        </Card>
        )}

        {section === "skills" && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle role="heading" aria-level={3} className="text-base">
              Skills
            </CardTitle>
            <CardDescription>
              Add the tools, disciplines, and strengths you want brothers to know about.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field id="profile-skills" label="Skills" hint="Enter one skill per line or separate them with commas.">
              <Textarea
                id="profile-skills"
                aria-describedby="profile-skills-hint"
                rows={4}
                value={form.skills}
                onChange={(event) => updateField("skills", event.target.value)}
                placeholder={"CAD\nPython\nProject Management"}
              />
            </Field>
          </CardContent>
        </Card>
        )}

        {section === "funFacts" && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle role="heading" aria-level={3} className="text-base">
              Fun facts
            </CardTitle>
            <CardDescription>
              Share a few memorable details that make your profile feel personal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field id="profile-fun-facts" label="Fun facts" hint="Enter one fact per line.">
              <Textarea
                id="profile-fun-facts"
                aria-describedby="profile-fun-facts-hint"
                rows={4}
                value={form.funFacts}
                onChange={(event) => updateField("funFacts", event.target.value)}
                placeholder={"Loves sunrise hikes\nCollects vintage cameras"}
              />
            </Field>
          </CardContent>
        </Card>
        )}

        {section === "projects" && (
        <CollectionCard
          title="Projects"
          description="Showcase projects, research, or things you have built."
          addLabel="Add project"
          onAdd={() => addArrayItem("projects")}
          empty={form.projects.length === 0}
        >
          {form.projects.map((project: ProjectItem, index: number) => (
            <CollectionItem
              key={`project-${index}`}
              title={`Project ${index + 1}`}
              removeLabel={`Remove project ${index + 1}`}
              onRemove={() => removeArrayItem("projects", index)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`project-${index}-title`} label="Project title">
                  <Input
                    id={`project-${index}-title`}
                    value={project.title}
                    onChange={(event) =>
                      updateArrayItem<ProjectItem, "title">(
                        "projects",
                        index,
                        "title",
                        event.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`project-${index}-link`} label="Project link">
                  <Input
                    id={`project-${index}-link`}
                    inputMode="url"
                    value={project.link}
                    onChange={(event) =>
                      updateArrayItem<ProjectItem, "link">(
                        "projects",
                        index,
                        "link",
                        event.target.value
                      )
                    }
                  />
                </Field>
              </div>
              <Field id={`project-${index}-description`} label="Description">
                <Textarea
                  id={`project-${index}-description`}
                  rows={3}
                  value={project.description}
                  onChange={(event) =>
                    updateArrayItem<ProjectItem, "description">(
                      "projects",
                      index,
                      "description",
                      event.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>
        )}

        {section === "work" && (
        <CollectionCard
          title="Work and internships"
          description="Add roles, internships, and other professional experience."
          addLabel="Add experience"
          onAdd={() => addArrayItem("work")}
          empty={form.work.length === 0}
        >
          {form.work.map((item: WorkItem, index: number) => (
            <CollectionItem
              key={`work-${index}`}
              title={`Experience ${index + 1}`}
              removeLabel={`Remove experience ${index + 1}`}
              onRemove={() => removeArrayItem("work", index)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`work-${index}-title`} label="Role title">
                  <Input
                    id={`work-${index}-title`}
                    value={item.title}
                    onChange={(event) =>
                      updateArrayItem<WorkItem, "title">(
                        "work",
                        index,
                        "title",
                        event.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`work-${index}-organization`} label="Organization">
                  <Input
                    id={`work-${index}-organization`}
                    value={item.organization}
                    onChange={(event) =>
                      updateArrayItem<WorkItem, "organization">(
                        "work",
                        index,
                        "organization",
                        event.target.value
                      )
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id={`work-${index}-start`} label="Start">
                  <Input
                    id={`work-${index}-start`}
                    value={item.start}
                    onChange={(event) =>
                      updateArrayItem<WorkItem, "start">(
                        "work",
                        index,
                        "start",
                        event.target.value
                      )
                    }
                    placeholder="Aug 2023"
                  />
                </Field>
                <Field id={`work-${index}-end`} label="End">
                  <Input
                    id={`work-${index}-end`}
                    value={item.end}
                    onChange={(event) =>
                      updateArrayItem<WorkItem, "end">(
                        "work",
                        index,
                        "end",
                        event.target.value
                      )
                    }
                    placeholder="May 2024"
                  />
                </Field>
                <Field id={`work-${index}-link`} label="Link">
                  <Input
                    id={`work-${index}-link`}
                    inputMode="url"
                    value={item.link}
                    onChange={(event) =>
                      updateArrayItem<WorkItem, "link">(
                        "work",
                        index,
                        "link",
                        event.target.value
                      )
                    }
                  />
                </Field>
              </div>
              <Field id={`work-${index}-description`} label="Description">
                <Textarea
                  id={`work-${index}-description`}
                  rows={3}
                  value={item.description}
                  onChange={(event) =>
                    updateArrayItem<WorkItem, "description">(
                      "work",
                      index,
                      "description",
                      event.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>
        )}

        {section === "awards" && (
        <CollectionCard
          title="Awards and certifications"
          description="Recognize certifications, honors, and other accomplishments."
          addLabel="Add award"
          onAdd={() => addArrayItem("awards")}
          empty={form.awards.length === 0}
        >
          {form.awards.map((award: AwardItem, index: number) => (
            <CollectionItem
              key={`award-${index}`}
              title={`Award ${index + 1}`}
              removeLabel={`Remove award ${index + 1}`}
              onRemove={() => removeArrayItem("awards", index)}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field id={`award-${index}-title`} label="Title" className="lg:col-span-2">
                  <Input
                    id={`award-${index}-title`}
                    value={award.title}
                    onChange={(event) =>
                      updateArrayItem<AwardItem, "title">(
                        "awards",
                        index,
                        "title",
                        event.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`award-${index}-issuer`} label="Issuer">
                  <Input
                    id={`award-${index}-issuer`}
                    value={award.issuer}
                    onChange={(event) =>
                      updateArrayItem<AwardItem, "issuer">(
                        "awards",
                        index,
                        "issuer",
                        event.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`award-${index}-date`} label="Date">
                  <Input
                    id={`award-${index}-date`}
                    value={award.date}
                    onChange={(event) =>
                      updateArrayItem<AwardItem, "date">(
                        "awards",
                        index,
                        "date",
                        event.target.value
                      )
                    }
                  />
                </Field>
              </div>
              <Field id={`award-${index}-description`} label="Description">
                <Textarea
                  id={`award-${index}-description`}
                  rows={3}
                  value={award.description}
                  onChange={(event) =>
                    updateArrayItem<AwardItem, "description">(
                      "awards",
                      index,
                      "description",
                      event.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>
        )}

        {section === "customSections" && (
        <CollectionCard
          title="Custom sections"
          description="Add anything else you want to highlight on your profile."
          addLabel="Add section"
          onAdd={() => addArrayItem("customSections")}
          empty={form.customSections.length === 0}
        >
          {form.customSections.map((section: CustomSection, index: number) => (
            <CollectionItem
              key={`section-${index}`}
              title={`Section ${index + 1}`}
              removeLabel={`Remove custom section ${index + 1}`}
              onRemove={() => removeArrayItem("customSections", index)}
            >
              <Field id={`section-${index}-title`} label="Section title">
                <Input
                  id={`section-${index}-title`}
                  value={section.title}
                  onChange={(event) =>
                    updateArrayItem<CustomSection, "title">(
                      "customSections",
                      index,
                      "title",
                      event.target.value
                    )
                  }
                />
              </Field>
              <Field id={`section-${index}-body`} label="Section body">
                <Textarea
                  id={`section-${index}-body`}
                  rows={3}
                  value={section.body}
                  onChange={(event) =>
                    updateArrayItem<CustomSection, "body">(
                      "customSections",
                      index,
                      "body",
                      event.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>
        )}

        {saveError && (
          <Alert variant="destructive" aria-live="assertive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Couldn’t save profile</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading} aria-busy={loading}>
          {loading ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save aria-hidden="true" />
              Save changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
