// app/member/onboard/OnboardForm.tsx
"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { CircleAlert, CircleCheck } from "lucide-react";

import ConnectWithDiscordButton from "@/components/ConnectWithDiscordButton";
import {
  PageContainer,
  PageHeader,
} from "../../../(members-only)/components/shell/PageShell";
import {
  CollectionCard,
  CollectionItem,
  Field,
} from "../../../(members-only)/components/shell/FormSections";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormAlert = { type: "success" | "destructive"; message: string } | null;

export default function OnboardForm({
  invitedEmail,
}: {
  invitedEmail: string;
}) {
  const { user, isLoaded } = useUser();

  const [form, setForm] = useState({
    rollNo: "",
    headline: "",
    pronouns: "",
    majors: "",
    minors: "",
    gradYear: "",
    hometown: "",
    bio: "",
    pledgeClass: "",
    skills: "",
    funFacts: "",
    github: "",
    linkedin: "",
    instagram: "",
    website: "",
    projects: [] as Array<{ title: string; description: string; link: string }>,
    work: [] as Array<{
      title: string;
      organization: string;
      start: string;
      end: string;
      description: string;
      link: string;
    }>,
    awards: [] as Array<{ title: string; issuer: string; date: string; description: string }>,
    customSections: [] as Array<{ title: string; body: string }>,
  });

  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<FormAlert>(null);
  const [showModal, setShowModal] = useState(false);

  const upd = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pledgeClassOptions = [
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

  const parseList = (text: string) =>
    text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

  const updateArrayItem = <T, K extends keyof T>(
    key: "projects" | "work" | "awards" | "customSections",
    index: number,
    field: K,
    value: string
  ) =>
    setForm((f) => {
      const copy = [...(f[key] as T[])];
      copy[index] = { ...copy[index], [field]: value };
      return { ...f, [key]: copy };
    });

  const addArrayItem = (
    key: "projects" | "work" | "awards" | "customSections"
  ) =>
    setForm((f) => {
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
      return { ...f, [key]: [...(f[key] as any[]), empty] };
    });

  const removeArrayItem = (
    key: "projects" | "work" | "awards" | "customSections",
    index: number
  ) =>
    setForm((f) => {
      const copy = [...(f[key] as any[])];
      copy.splice(index, 1);
      return { ...f, [key]: copy };
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAlert(null);

    const payload = {
      rollNo: form.rollNo.trim(),
      headline: form.headline.trim(),
      pronouns: form.pronouns.trim(),
      majors: parseList(form.majors),
      minors: parseList(form.minors),
      gradYear: Number(form.gradYear),
      hometown: form.hometown.trim(),
      bio: form.bio.trim(),
      pledgeClass: form.pledgeClass.trim(),
      skills: parseList(form.skills),
      funFacts: parseList(form.funFacts),
      projects: form.projects,
      work: form.work,
      awards: form.awards,
      customSections: form.customSections,
      socialLinks: {
        github: form.github.trim(),
        linkedin: form.linkedin.trim(),
        instagram: form.instagram.trim(),
        website: form.website.trim(),
      },
    };

    const res = await fetch("/api/members/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowModal(true);
    } else {
      const { error } = await res.json().catch(() => ({}));
      setAlert({
        type: "destructive",
        message: error || "Something went wrong",
      });
    }
    setSaving(false);
  }

  if (!isLoaded) return null;

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const fName = user?.firstName ?? "";
  const lName = user?.lastName ?? "";

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow={
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Delta Gamma Onboarding
          </p>
        }
        title={`Welcome, ${fName}`}
        description="Complete your profile to unlock member tools."
      />

      <Card className="mb-6 border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Discord Linking Required</CardTitle>
          <CardDescription>
            In order to get access to the site again please link your Discord
            account so we can connect your membership to the Discord Server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectWithDiscordButton />
        </CardContent>
      </Card>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your account</CardTitle>
            <CardDescription>
              Taken from your sign-in. Ask an officer if anything here is wrong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  First Name
                </dt>
                <dd className="m-0 text-sm font-medium text-foreground">
                  {fName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Last Name
                </dt>
                <dd className="m-0 text-sm font-medium text-foreground">
                  {lName}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  E-mail
                </dt>
                <dd className="m-0 truncate text-sm font-medium text-foreground">
                  {invitedEmail}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile Builder</CardTitle>
            <CardDescription>
              How you appear in the chapter directory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="onboard-headline"
                label="Headline / Tagline"
                className="sm:col-span-2"
              >
                <Input
                  id="onboard-headline"
                  value={form.headline}
                  onChange={(e) => upd("headline", e.target.value)}
                  placeholder="Aspiring robotics engineer • Project lead"
                />
              </Field>
              <Field id="onboard-pronouns" label="Pronouns">
                <Input
                  id="onboard-pronouns"
                  value={form.pronouns}
                  onChange={(e) => upd("pronouns", e.target.value)}
                  placeholder="he/him, she/her, they/them"
                />
              </Field>
            </div>

            <Field id="onboard-roll" label="Roll Number">
              <Input
                id="onboard-roll"
                value={form.rollNo}
                onChange={(e) => upd("rollNo", e.target.value)}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="onboard-majors" label="Majors (comma-separated)">
                <Input
                  id="onboard-majors"
                  value={form.majors}
                  onChange={(e) => upd("majors", e.target.value)}
                />
              </Field>
              <Field id="onboard-minors" label="Minors (comma-separated)">
                <Input
                  id="onboard-minors"
                  value={form.minors}
                  onChange={(e) => upd("minors", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="onboard-grad" label="Graduation Year">
                <Input
                  id="onboard-grad"
                  type="number"
                  value={form.gradYear}
                  onChange={(e) => upd("gradYear", e.target.value)}
                />
              </Field>
              <Field id="onboard-pledge" label="Pledge Class">
                <Select
                  value={form.pledgeClass}
                  onValueChange={(value) => upd("pledgeClass", value)}
                >
                  <SelectTrigger id="onboard-pledge">
                    <SelectValue placeholder="Select pledge class" />
                  </SelectTrigger>
                  <SelectContent>
                    {pledgeClassOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="onboard-hometown" label="Hometown">
                <Input
                  id="onboard-hometown"
                  value={form.hometown}
                  onChange={(e) => upd("hometown", e.target.value)}
                />
              </Field>
            </div>

            <Field id="onboard-bio" label="Bio">
              <Textarea
                id="onboard-bio"
                rows={4}
                value={form.bio}
                onChange={(e) => upd("bio", e.target.value)}
                placeholder="Share your story, interests, or what you're working on."
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Links &amp; Highlights</CardTitle>
            <CardDescription>
              Optional. Anything you leave blank is simply hidden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="onboard-github" label="GitHub URL">
                <Input
                  id="onboard-github"
                  inputMode="url"
                  value={form.github}
                  onChange={(e) => upd("github", e.target.value)}
                  placeholder="https://github.com/username"
                />
              </Field>
              <Field id="onboard-linkedin" label="LinkedIn URL">
                <Input
                  id="onboard-linkedin"
                  inputMode="url"
                  value={form.linkedin}
                  onChange={(e) => upd("linkedin", e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="onboard-instagram" label="Instagram URL">
                <Input
                  id="onboard-instagram"
                  inputMode="url"
                  value={form.instagram}
                  onChange={(e) => upd("instagram", e.target.value)}
                  placeholder="https://instagram.com/username"
                />
              </Field>
              <Field id="onboard-website" label="Personal Website">
                <Input
                  id="onboard-website"
                  inputMode="url"
                  value={form.website}
                  onChange={(e) => upd("website", e.target.value)}
                  placeholder="https://your-site.com"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="onboard-skills" label="Skills (one per line)">
                <Textarea
                  id="onboard-skills"
                  rows={4}
                  value={form.skills}
                  onChange={(e) => upd("skills", e.target.value)}
                  placeholder={"CAD\nPython\nProject Management"}
                />
              </Field>
              <Field id="onboard-funfacts" label="Fun Facts (one per line)">
                <Textarea
                  id="onboard-funfacts"
                  rows={4}
                  value={form.funFacts}
                  onChange={(e) => upd("funFacts", e.target.value)}
                  placeholder={"Loves sunrise hikes\nCollects vintage cameras"}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <CollectionCard
          title="Projects"
          description="Showcase projects, research, or things you have built."
          addLabel="Add project"
          onAdd={() => addArrayItem("projects")}
          empty={form.projects.length === 0}
        >
          {form.projects.map((project, index) => (
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
                    onChange={(e) =>
                      updateArrayItem<typeof project, "title">(
                        "projects",
                        index,
                        "title",
                        e.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`project-${index}-link`} label="Project link">
                  <Input
                    id={`project-${index}-link`}
                    inputMode="url"
                    value={project.link}
                    onChange={(e) =>
                      updateArrayItem<typeof project, "link">(
                        "projects",
                        index,
                        "link",
                        e.target.value
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
                  onChange={(e) =>
                    updateArrayItem<typeof project, "description">(
                      "projects",
                      index,
                      "description",
                      e.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>

        <CollectionCard
          title="Work and internships"
          description="Add roles, internships, and other professional experience."
          addLabel="Add experience"
          onAdd={() => addArrayItem("work")}
          empty={form.work.length === 0}
        >
          {form.work.map((item, index) => (
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
                    onChange={(e) =>
                      updateArrayItem<typeof item, "title">(
                        "work",
                        index,
                        "title",
                        e.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`work-${index}-org`} label="Organization">
                  <Input
                    id={`work-${index}-org`}
                    value={item.organization}
                    onChange={(e) =>
                      updateArrayItem<typeof item, "organization">(
                        "work",
                        index,
                        "organization",
                        e.target.value
                      )
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id={`work-${index}-start`} label="Start">
                  <Input
                    id={`work-${index}-start`}
                    placeholder="Aug 2023"
                    value={item.start}
                    onChange={(e) =>
                      updateArrayItem<typeof item, "start">(
                        "work",
                        index,
                        "start",
                        e.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`work-${index}-end`} label="End">
                  <Input
                    id={`work-${index}-end`}
                    placeholder="May 2024"
                    value={item.end}
                    onChange={(e) =>
                      updateArrayItem<typeof item, "end">(
                        "work",
                        index,
                        "end",
                        e.target.value
                      )
                    }
                  />
                </Field>
                <Field id={`work-${index}-link`} label="Link">
                  <Input
                    id={`work-${index}-link`}
                    inputMode="url"
                    value={item.link}
                    onChange={(e) =>
                      updateArrayItem<typeof item, "link">(
                        "work",
                        index,
                        "link",
                        e.target.value
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
                  onChange={(e) =>
                    updateArrayItem<typeof item, "description">(
                      "work",
                      index,
                      "description",
                      e.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>

        <CollectionCard
          title="Awards and certifications"
          description="Recognition, scholarships, and credentials you have earned."
          addLabel="Add award"
          onAdd={() => addArrayItem("awards")}
          empty={form.awards.length === 0}
        >
          {form.awards.map((award, index) => (
            <CollectionItem
              key={`award-${index}`}
              title={`Award ${index + 1}`}
              removeLabel={`Remove award ${index + 1}`}
              onRemove={() => removeArrayItem("awards", index)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`award-${index}-title`} label="Title">
                  <Input
                    id={`award-${index}-title`}
                    value={award.title}
                    onChange={(e) =>
                      updateArrayItem<typeof award, "title">(
                        "awards",
                        index,
                        "title",
                        e.target.value
                      )
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={`award-${index}-issuer`} label="Issuer">
                    <Input
                      id={`award-${index}-issuer`}
                      value={award.issuer}
                      onChange={(e) =>
                        updateArrayItem<typeof award, "issuer">(
                          "awards",
                          index,
                          "issuer",
                          e.target.value
                        )
                      }
                    />
                  </Field>
                  <Field id={`award-${index}-date`} label="Date">
                    <Input
                      id={`award-${index}-date`}
                      value={award.date}
                      onChange={(e) =>
                        updateArrayItem<typeof award, "date">(
                          "awards",
                          index,
                          "date",
                          e.target.value
                        )
                      }
                    />
                  </Field>
                </div>
              </div>
              <Field id={`award-${index}-description`} label="Description">
                <Textarea
                  id={`award-${index}-description`}
                  rows={2}
                  value={award.description}
                  onChange={(e) =>
                    updateArrayItem<typeof award, "description">(
                      "awards",
                      index,
                      "description",
                      e.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>

        <CollectionCard
          title="Custom sections"
          description="Anything else you would like on your profile."
          addLabel="Add section"
          onAdd={() => addArrayItem("customSections")}
          empty={form.customSections.length === 0}
        >
          {form.customSections.map((section, index) => (
            <CollectionItem
              key={`section-${index}`}
              title={`Section ${index + 1}`}
              removeLabel={`Remove section ${index + 1}`}
              onRemove={() => removeArrayItem("customSections", index)}
            >
              <Field id={`section-${index}-title`} label="Section title">
                <Input
                  id={`section-${index}-title`}
                  value={section.title}
                  onChange={(e) =>
                    updateArrayItem<typeof section, "title">(
                      "customSections",
                      index,
                      "title",
                      e.target.value
                    )
                  }
                />
              </Field>
              <Field id={`section-${index}-body`} label="Section body">
                <Textarea
                  id={`section-${index}-body`}
                  rows={3}
                  value={section.body}
                  onChange={(e) =>
                    updateArrayItem<typeof section, "body">(
                      "customSections",
                      index,
                      "body",
                      e.target.value
                    )
                  }
                />
              </Field>
            </CollectionItem>
          ))}
        </CollectionCard>

        <div aria-live="polite" className="empty:hidden">
          {alert && (
            <Alert
              variant={alert.type === "success" ? "success" : "destructive"}
              role="alert"
            >
              {alert.type === "success" ? (
                <CircleCheck aria-hidden="true" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Submitting…" : "Submit Profile"}
          </Button>
        </div>
      </form>

      {/* Terminal state: the profile is filed and the only way on is Done, so
        * this dialog is deliberately not dismissable. */}
      <Dialog open={showModal}>
        <DialogContent
          /* `[&>button]:hidden` removes DialogContent's built-in close X: the
           * only direct-child <button> is that Close, and with a controlled
           * `open` and no onOpenChange it would render an inert control. */
          className="w-[calc(100%-2rem)] max-w-md [&>button]:hidden"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Profile submitted!</DialogTitle>
            <DialogDescription>
              Thanks for completing your profile. An officer will review it
              shortly. Once approved you&apos;ll have access to member
              tools.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button asChild>
              <a href="/">Done</a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
