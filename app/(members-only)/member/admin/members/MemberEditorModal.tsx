"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BriefcaseBusiness,
  Check,
  Eye,
  EyeOff,
  FileText,
  History,
  ImageIcon,
  Link2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  WandSparkles,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PhotoUploader from "../../profile/[rollNo]/PhotoUploader";
import ResumeUploader from "../../profile/[rollNo]/ResumeUploader";

type ProjectItem = { title?: string; description?: string; link?: string };
type WorkItem = {
  title?: string;
  organization?: string;
  start?: string;
  end?: string;
  description?: string;
  link?: string;
};
type AwardItem = {
  title?: string;
  issuer?: string;
  date?: string;
  description?: string;
};
type CustomSection = { title?: string; body?: string };

export interface MemberData {
  _id: string;
  rollNo: string;
  fName: string;
  lName: string;
  clerkId?: string;
  discordId?: string;
  role: "superadmin" | "admin" | "member";
  status?: "Active" | "Alumni" | "Removed" | "Deceased";
  isECouncil: boolean;
  ecouncilPosition: string;
  isCommitteeHead: boolean;
  familyLine: string;
  bigs: string[];
  littles: string[];
  majors: string[];
  minors?: string[];
  gradYear: number;
  bio?: string;
  headline?: string;
  pronouns?: string;
  skills?: string[];
  funFacts?: string[];
  projects?: ProjectItem[];
  work?: WorkItem[];
  awards?: AwardItem[];
  customSections?: CustomSection[];
  hometown?: string;
  pledgeClass?: string;
  socialLinks?: Record<string, string>;
  profilePicUrl?: string;
  resumeUrl?: string;
  isHidden?: boolean;
  previousECouncilRoles?: string[];
  previousCommitteesChaired?: string[];
  previousCommitteesMemberOf?: string[];
}

interface MemberShort {
  _id: string;
  fName: string;
  lName: string;
}

interface Props {
  member: MemberData;
  show: boolean;
  onClose: () => void;
  onSave: (updates: Partial<MemberData>) => Promise<void>;
}

type EditorSection = "profile" | "access" | "highlights" | "experience" | "history";

const EDITOR_SECTIONS: Array<{
  value: EditorSection;
  label: string;
  icon: typeof UserRound;
}> = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "access", label: "Access & chapter", icon: ShieldCheck },
  { value: "highlights", label: "Links & highlights", icon: Link2 },
  { value: "experience", label: "Experience", icon: BriefcaseBusiness },
  { value: "history", label: "History", icon: History },
];

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

function getMemberId(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in value) {
    return String((value as { _id?: unknown })._id ?? "");
  }
  return "";
}

function getMemberIds(values: unknown[] | undefined) {
  return Array.isArray(values)
    ? values.map((value) => getMemberId(value)).filter(Boolean)
    : [];
}

function createFormState(member: MemberData) {
  const socials = member.socialLinks ?? {};
  return {
    rollNo: member.rollNo,
    fName: member.fName,
    lName: member.lName,
    status: member.status ?? "Active",
    // Legacy superadmin records behave exactly like admins and normalize on save.
    role: member.role === "superadmin" ? "admin" : member.role,
    isHidden: Boolean(member.isHidden),
    isECouncil: member.isECouncil,
    ecouncilPosition: member.ecouncilPosition,
    isCommitteeHead: member.isCommitteeHead,
    familyLine: member.familyLine,
    discordId: member.discordId ?? "",
    bigs: getMemberIds(member.bigs),
    littles: getMemberIds(member.littles),
    headline: member.headline ?? "",
    pronouns: member.pronouns ?? "",
    majors: (member.majors ?? []).join(", "),
    minors: member.minors?.join(", ") ?? "",
    gradYear: member.gradYear ? String(member.gradYear) : "",
    bio: member.bio ?? "",
    hometown: member.hometown ?? "",
    pledgeClass: member.pledgeClass ?? "",
    skills: (member.skills ?? []).join("\n"),
    funFacts: (member.funFacts ?? []).join("\n"),
    github: socials.github ?? "",
    linkedin: socials.linkedin ?? "",
    instagram: socials.instagram ?? "",
    website: socials.website ?? "",
    projects: (member.projects ?? []).map((item) => ({
      title: item.title ?? "",
      description: item.description ?? "",
      link: item.link ?? "",
    })),
    work: (member.work ?? []).map((item) => ({
      title: item.title ?? "",
      organization: item.organization ?? "",
      start: item.start ?? "",
      end: item.end ?? "",
      description: item.description ?? "",
      link: item.link ?? "",
    })),
    awards: (member.awards ?? []).map((item) => ({
      title: item.title ?? "",
      issuer: item.issuer ?? "",
      date: item.date ?? "",
      description: item.description ?? "",
    })),
    customSections: (member.customSections ?? []).map((item) => ({
      title: item.title ?? "",
      body: item.body ?? "",
    })),
  };
}

type FormState = ReturnType<typeof createFormState>;

function parseList(text: string) {
  return text
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatHistoryList(values?: string[]) {
  return Array.isArray(values) && values.length ? values.join("\n") : "None recorded";
}

function getMemberDisplayName(member: MemberShort) {
  return `${member.fName} ${member.lName}`;
}

export default function MemberEditorModal({ member, show, onClose, onSave }: Props) {
  const [form, setForm] = useState<FormState>(() => createFormState(member));
  const [activeSection, setActiveSection] = useState<EditorSection>("profile");
  const [allMembers, setAllMembers] = useState<MemberShort[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showRelationsModal, setShowRelationsModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    let active = true;

    setForm(createFormState(member));
    setActiveSection("profile");
    setSaved(false);
    setError(null);

    fetch("/api/members")
      .then((response) => response.json())
      .then((list: MemberData[]) => {
        if (!active) return;
        setAllMembers(
          list
            .filter((candidate) => candidate.rollNo !== member.rollNo)
            .map((candidate) => ({
              _id: candidate._id,
              fName: candidate.fName,
              lName: candidate.lName,
            }))
        );
      })
      .catch(() => {
        if (active) setAllMembers([]);
      });

    return () => {
      active = false;
    };
  }, [member, show]);

  const resolvedPhotoUrl = useMemo(() => {
    const raw = member.profilePicUrl?.trim() ?? "";
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("data:") ||
      raw.startsWith("/")
    ) {
      return raw;
    }
    return "";
  }, [member.profilePicUrl]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateArrayItem<T, K extends keyof T>(
    key: "projects" | "work" | "awards" | "customSections",
    index: number,
    field: K,
    value: string
  ) {
    setForm((current) => {
      const copy = [...(current[key] as T[])];
      copy[index] = { ...copy[index], [field]: value };
      return { ...current, [key]: copy };
    });
  }

  function addArrayItem(key: "projects" | "work" | "awards" | "customSections") {
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
      return { ...current, [key]: [...current[key], empty] } as FormState;
    });
  }

  function removeArrayItem(
    key: "projects" | "work" | "awards" | "customSections",
    index: number
  ) {
    setForm((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const gradYear = Number(form.gradYear);
    const payload: Partial<MemberData> = {
      rollNo: form.rollNo.trim(),
      fName: form.fName.trim(),
      lName: form.lName.trim(),
      role: form.role,
      status: form.status,
      isHidden: form.isHidden,
      isECouncil: form.isECouncil,
      ecouncilPosition: form.isECouncil ? form.ecouncilPosition : "",
      isCommitteeHead: form.isCommitteeHead,
      familyLine: form.familyLine,
      discordId: form.discordId.trim() || undefined,
      bigs: form.bigs,
      littles: form.littles,
      headline: form.headline.trim(),
      pronouns: form.pronouns.trim(),
      majors: parseList(form.majors),
      minors: parseList(form.minors),
      ...(Number.isFinite(gradYear) && gradYear ? { gradYear } : {}),
      bio: form.bio,
      hometown: form.hometown,
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

    try {
      await onSave(payload);
      setSaved(true);
      window.setTimeout(onClose, 700);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const initials = `${member.fName?.[0] ?? ""}${member.lName?.[0] ?? ""}`;

  return (
    <>
      <Dialog
        open={show}
        onOpenChange={(open) => {
          if (!open && !saving) onClose();
        }}
      >
        <DialogContent className="flex h-[min(92vh,900px)] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14 text-left sm:px-6">
            <DialogTitle>Edit {member.fName}’s profile</DialogTitle>
            <DialogDescription>
              Update profile details, chapter access, relationships, and highlights.
            </DialogDescription>
          </DialogHeader>

          {saved ? (
            <Alert className="m-4 mb-0 border-emerald-600/30 bg-emerald-600/10 sm:mx-6">
              <Check className="size-4 text-emerald-600" />
              <AlertTitle>Changes saved</AlertTitle>
              <AlertDescription>The member profile is up to date.</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive" className="m-4 mb-0 sm:mx-6">
              <AlertTitle>Unable to save changes</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Tabs
            value={activeSection}
            onValueChange={(value) => setActiveSection(value as EditorSection)}
            className="flex min-h-0 flex-1 flex-col md:flex-row"
          >
            <aside className="shrink-0 border-b bg-muted/30 p-3 md:w-60 md:border-b-0 md:border-r md:p-4">
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 md:flex-col md:items-stretch">
                {EDITOR_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <TabsTrigger
                      key={section.value}
                      value={section.value}
                      className="shrink-0 justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-background md:w-full"
                    >
                      <Icon className="size-4" />
                      {section.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <TabsContent value="profile" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Profile"
                    description="The details members see first on this profile."
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Profile media</CardTitle>
                      <CardDescription>Photo and résumé shown on the member profile.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <Avatar className="size-24 border-2 border-primary/20">
                        {resolvedPhotoUrl ? (
                          <AvatarImage
                            src={resolvedPhotoUrl}
                            alt={`${member.fName} ${member.lName}`}
                          />
                        ) : null}
                        <AvatarFallback className="text-xl font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowPhotoModal(true)}
                        >
                          <ImageIcon className="size-4" />
                          {resolvedPhotoUrl ? "Update photo" : "Add photo"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowResumeModal(true)}
                        >
                          <FileText className="size-4" />
                          {member.resumeUrl ? "Update résumé" : "Add résumé"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Profile basics</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <Field label="Headline or tagline" className="sm:col-span-2">
                        <Input
                          value={form.headline}
                          onChange={(event) => update("headline", event.target.value)}
                          placeholder="Aspiring robotics engineer • Project lead"
                        />
                      </Field>
                      <Field label="Pronouns">
                        <Input
                          value={form.pronouns}
                          onChange={(event) => update("pronouns", event.target.value)}
                          placeholder="he/him, she/her, they/them"
                        />
                      </Field>
                      <Field label="Hometown">
                        <Input
                          value={form.hometown}
                          onChange={(event) => update("hometown", event.target.value)}
                        />
                      </Field>
                      <Field label="Majors" description="Separate multiple majors with commas.">
                        <Input
                          value={form.majors}
                          onChange={(event) => update("majors", event.target.value)}
                        />
                      </Field>
                      <Field label="Minors" description="Separate multiple minors with commas.">
                        <Input
                          value={form.minors}
                          onChange={(event) => update("minors", event.target.value)}
                        />
                      </Field>
                      <Field label="Graduation year">
                        <Input
                          type="number"
                          value={form.gradYear}
                          onChange={(event) => update("gradYear", event.target.value)}
                        />
                      </Field>
                      <Field label="Pledge class">
                        <Select
                          value={form.pledgeClass || "none"}
                          onValueChange={(value) =>
                            update("pledgeClass", value === "none" ? "" : value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select pledge class" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not selected</SelectItem>
                            {pledgeClassOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Bio" className="sm:col-span-2">
                        <Textarea
                          value={form.bio}
                          onChange={(event) => update("bio", event.target.value)}
                          placeholder="Share their story, interests, or current work."
                          className="min-h-32"
                        />
                      </Field>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="access" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Access & chapter"
                    description="Identity, account permissions, status, and chapter relationships."
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Identity</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <Field label="First name">
                        <Input
                          value={form.fName}
                          onChange={(event) => update("fName", event.target.value)}
                        />
                      </Field>
                      <Field label="Last name">
                        <Input
                          value={form.lName}
                          onChange={(event) => update("lName", event.target.value)}
                        />
                      </Field>
                      <Field label="Roll number">
                        <Input
                          value={form.rollNo}
                          onChange={(event) => update("rollNo", event.target.value)}
                        />
                      </Field>
                      <Field label="Status">
                        <Select
                          value={form.status}
                          onValueChange={(value) =>
                            update("status", value as FormState["status"])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Alumni">Alumni</SelectItem>
                            <SelectItem value="Removed">Removed</SelectItem>
                            <SelectItem value="Deceased">Deceased</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field
                        label="Discord user ID"
                        description="Enable Developer Mode in Discord to copy a user ID."
                        className="sm:col-span-2"
                      >
                        <Input
                          value={form.discordId}
                          onChange={(event) => update("discordId", event.target.value)}
                          placeholder="123456789012345678"
                        />
                      </Field>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Permissions</CardTitle>
                      <CardDescription>
                        Admin and legacy superadmin accounts now share the same access.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <ToggleRow
                        pressed={form.role === "admin"}
                        onPressedChange={(pressed) =>
                          update("role", pressed ? "admin" : "member")
                        }
                        icon={ShieldCheck}
                        title="Administrator"
                        description="Full chapter administration access."
                      />
                      <ToggleRow
                        pressed={!form.isHidden}
                        onPressedChange={(pressed) => update("isHidden", !pressed)}
                        icon={form.isHidden ? EyeOff : Eye}
                        title="Public profile"
                        description="Visible in chapter directories."
                      />
                      <ToggleRow
                        pressed={form.isECouncil}
                        onPressedChange={(pressed) => update("isECouncil", pressed)}
                        icon={Users}
                        title="E-Council"
                        description="Current executive council member."
                      />
                      <ToggleRow
                        pressed={form.isCommitteeHead}
                        onPressedChange={(pressed) => update("isCommitteeHead", pressed)}
                        icon={WandSparkles}
                        title="Committee head"
                        description="Leads one or more committees."
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Chapter relationships</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      {form.isECouncil ? (
                        <Field label="E-Council position">
                          <Input
                            value={form.ecouncilPosition}
                            onChange={(event) =>
                              update("ecouncilPosition", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      <Field label="Family line">
                        <Input
                          value={form.familyLine}
                          onChange={(event) => update("familyLine", event.target.value)}
                        />
                      </Field>
                      <div className="space-y-3 sm:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <Label>Bigs & littles</Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Keep family relationships connected to member records.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowRelationsModal(true)}
                          >
                            Manage relationships
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <RelationshipSummary
                            label="Bigs"
                            members={allMembers}
                            selectedIds={form.bigs}
                          />
                          <RelationshipSummary
                            label="Littles"
                            members={allMembers}
                            selectedIds={form.littles}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="highlights" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Links & highlights"
                    description="External profiles and personal details shown on the profile."
                  />
                  <Card>
                    <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                      <Field label="GitHub URL">
                        <Input
                          type="url"
                          value={form.github}
                          onChange={(event) => update("github", event.target.value)}
                          placeholder="https://github.com/username"
                        />
                      </Field>
                      <Field label="LinkedIn URL">
                        <Input
                          type="url"
                          value={form.linkedin}
                          onChange={(event) => update("linkedin", event.target.value)}
                          placeholder="https://linkedin.com/in/username"
                        />
                      </Field>
                      <Field label="Instagram URL">
                        <Input
                          type="url"
                          value={form.instagram}
                          onChange={(event) => update("instagram", event.target.value)}
                          placeholder="https://instagram.com/username"
                        />
                      </Field>
                      <Field label="Personal website">
                        <Input
                          type="url"
                          value={form.website}
                          onChange={(event) => update("website", event.target.value)}
                          placeholder="https://your-site.com"
                        />
                      </Field>
                      <Field label="Skills" description="Enter one skill per line.">
                        <Textarea
                          value={form.skills}
                          onChange={(event) => update("skills", event.target.value)}
                          placeholder={"CAD\nPython\nProject Management"}
                          className="min-h-40"
                        />
                      </Field>
                      <Field label="Fun facts" description="Enter one fact per line.">
                        <Textarea
                          value={form.funFacts}
                          onChange={(event) => update("funFacts", event.target.value)}
                          placeholder={"Loves sunrise hikes\nCollects vintage cameras"}
                          className="min-h-40"
                        />
                      </Field>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="experience" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Experience"
                    description="Projects, work, awards, and custom profile sections."
                  />

                  <RepeaterHeader
                    icon={WandSparkles}
                    title="Projects"
                    actionLabel="Add project"
                    onAdd={() => addArrayItem("projects")}
                  />
                  {form.projects.length ? (
                    form.projects.map((project, index) => (
                      <Card key={`project-${index}`}>
                        <ItemHeader
                          title={`Project ${index + 1}`}
                          onRemove={() => removeArrayItem("projects", index)}
                        />
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                          <Input
                            aria-label={`Project ${index + 1} title`}
                            placeholder="Project title"
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
                          <Input
                            aria-label={`Project ${index + 1} link`}
                            placeholder="Project link"
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
                          <Textarea
                            aria-label={`Project ${index + 1} description`}
                            placeholder="Short description"
                            className="sm:col-span-2"
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
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <EmptyCollection label="No projects added." />
                  )}

                  <Separator />
                  <RepeaterHeader
                    icon={BriefcaseBusiness}
                    title="Work & internships"
                    actionLabel="Add experience"
                    onAdd={() => addArrayItem("work")}
                  />
                  {form.work.length ? (
                    form.work.map((item, index) => (
                      <Card key={`work-${index}`}>
                        <ItemHeader
                          title={`Experience ${index + 1}`}
                          onRemove={() => removeArrayItem("work", index)}
                        />
                        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <Input
                            aria-label={`Experience ${index + 1} title`}
                            placeholder="Role title"
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
                          <Input
                            aria-label={`Experience ${index + 1} organization`}
                            placeholder="Organization"
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
                          <Input
                            aria-label={`Experience ${index + 1} link`}
                            placeholder="Link"
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
                          <Input
                            aria-label={`Experience ${index + 1} start date`}
                            placeholder="Start (e.g. Aug 2023)"
                            value={item.start}
                            onChange={(event) =>
                              updateArrayItem<WorkItem, "start">(
                                "work",
                                index,
                                "start",
                                event.target.value
                              )
                            }
                          />
                          <Input
                            aria-label={`Experience ${index + 1} end date`}
                            placeholder="End (e.g. May 2024)"
                            value={item.end}
                            onChange={(event) =>
                              updateArrayItem<WorkItem, "end">(
                                "work",
                                index,
                                "end",
                                event.target.value
                              )
                            }
                          />
                          <Textarea
                            aria-label={`Experience ${index + 1} description`}
                            placeholder="Description"
                            className="sm:col-span-2 lg:col-span-3"
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
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <EmptyCollection label="No work experience added." />
                  )}

                  <Separator />
                  <RepeaterHeader
                    icon={Award}
                    title="Awards & certifications"
                    actionLabel="Add award"
                    onAdd={() => addArrayItem("awards")}
                  />
                  {form.awards.length ? (
                    form.awards.map((award, index) => (
                      <Card key={`award-${index}`}>
                        <ItemHeader
                          title={`Award ${index + 1}`}
                          onRemove={() => removeArrayItem("awards", index)}
                        />
                        <CardContent className="grid gap-3 sm:grid-cols-3">
                          <Input
                            aria-label={`Award ${index + 1} title`}
                            placeholder="Title"
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
                          <Input
                            aria-label={`Award ${index + 1} issuer`}
                            placeholder="Issuer"
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
                          <Input
                            aria-label={`Award ${index + 1} date`}
                            placeholder="Date"
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
                          <Textarea
                            aria-label={`Award ${index + 1} description`}
                            placeholder="Description"
                            className="sm:col-span-3"
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
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <EmptyCollection label="No awards added." />
                  )}

                  <Separator />
                  <RepeaterHeader
                    icon={FileText}
                    title="Custom sections"
                    actionLabel="Add section"
                    onAdd={() => addArrayItem("customSections")}
                  />
                  {form.customSections.length ? (
                    form.customSections.map((section, index) => (
                      <Card key={`section-${index}`}>
                        <ItemHeader
                          title={`Section ${index + 1}`}
                          onRemove={() => removeArrayItem("customSections", index)}
                        />
                        <CardContent className="space-y-3">
                          <Input
                            aria-label={`Custom section ${index + 1} title`}
                            placeholder="Section title"
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
                          <Textarea
                            aria-label={`Custom section ${index + 1} body`}
                            placeholder="Section body"
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
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <EmptyCollection label="No custom sections added." />
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Chapter history"
                    description="Read-only records retained from previous service."
                  />
                  <Card>
                    <CardContent className="grid gap-4 p-5 lg:grid-cols-3">
                      <Field label="Previous E-Council roles">
                        <Textarea
                          value={formatHistoryList(member.previousECouncilRoles)}
                          readOnly
                          className="min-h-40 bg-muted/40"
                        />
                      </Field>
                      <Field label="Previous committees chaired">
                        <Textarea
                          value={formatHistoryList(member.previousCommitteesChaired)}
                          readOnly
                          className="min-h-40 bg-muted/40"
                        />
                      </Field>
                      <Field label="Previous committee memberships">
                        <Textarea
                          value={formatHistoryList(member.previousCommitteesMemberOf)}
                          readOnly
                          className="min-h-40 bg-muted/40"
                        />
                      </Field>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t bg-background p-4 sm:px-6">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={showRelationsModal} onOpenChange={setShowRelationsModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage bigs and littles</DialogTitle>
            <DialogDescription>
              Search for members and assign chapter family relationships.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 md:grid-cols-2">
            <MemberTokenPicker
              label="Bigs"
              members={allMembers}
              selectedIds={form.bigs}
              onChange={(values) => update("bigs", values)}
            />
            <MemberTokenPicker
              label="Littles"
              members={allMembers}
              selectedIds={form.littles}
              onChange={(values) => update("littles", values)}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setShowRelationsModal(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPhotoModal ? (
        <PhotoUploader
          show={showPhotoModal}
          initialUrl={member.profilePicUrl}
          onError={setError}
          onClose={() => setShowPhotoModal(false)}
          targetRollNo={member.rollNo}
        />
      ) : null}
      {showResumeModal ? (
        <ResumeUploader
          show={showResumeModal}
          initialUrl={member.resumeUrl}
          onError={setError}
          onClose={() => setShowResumeModal(false)}
          targetRollNo={member.rollNo}
        />
      ) : null}
    </>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({
  label,
  description,
  className = "",
  children,
}: {
  label: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function ToggleRow({
  pressed,
  onPressedChange,
  icon: Icon,
  title,
  description,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[pressed=true]:border-primary/50 data-[pressed=true]:bg-primary/10"
      data-pressed={pressed}
    >
      <span className="rounded-md bg-muted p-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 font-medium">
          {title}
          <Badge variant={pressed ? "default" : "muted"}>
            {pressed ? "On" : "Off"}
          </Badge>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function RepeaterHeader({
  icon: Icon,
  title,
  actionLabel,
  onAdd,
}: {
  icon: typeof Award;
  title: string;
  actionLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" />
        {title}
      </h3>
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="size-4" />
        {actionLabel}
      </Button>
    </div>
  );
}

function ItemHeader({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
      <CardTitle className="text-sm">{title}</CardTitle>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
        Remove
      </Button>
    </CardHeader>
  );
}

function EmptyCollection({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function RelationshipSummary({
  label,
  members,
  selectedIds,
}: {
  label: string;
  members: MemberShort[];
  selectedIds: string[];
}) {
  const selected = selectedIds
    .map((id) => members.find((member) => member._id === id))
    .filter(Boolean) as MemberShort[];

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {selected.length ? (
          selected.map((member) => (
            <Badge key={member._id} variant="secondary">
              {getMemberDisplayName(member)}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None selected</span>
        )}
      </div>
    </div>
  );
}

function MemberTokenPicker({
  label,
  members,
  selectedIds,
  onChange,
}: {
  label: string;
  members: MemberShort[];
  selectedIds: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedMembers = useMemo(
    () =>
      selectedIds
        .map((id) => members.find((member) => member._id === id))
        .filter(Boolean) as MemberShort[],
    [members, selectedIds]
  );
  const availableMembers = useMemo(() => {
    const selected = new Set(selectedIds);
    const normalizedQuery = query.trim().toLowerCase();
    return members
      .filter((member) => !selected.has(member._id))
      .filter((member) =>
        normalizedQuery
          ? getMemberDisplayName(member).toLowerCase().includes(normalizedQuery)
          : true
      )
      .slice(0, 8);
  }, [members, query, selectedIds]);

  function addMember(memberId: string) {
    if (!memberId || selectedIds.includes(memberId)) return;
    onChange([...selectedIds, memberId]);
    setQuery("");
  }

  function removeMember(memberId: string) {
    onChange(selectedIds.filter((id) => id !== memberId));
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-1.5">
        {selectedMembers.map((member) => (
          <Badge key={member._id} variant="secondary" className="gap-1 pr-1">
            {getMemberDisplayName(member)}
            <button
              type="button"
              onClick={() => removeMember(member._id)}
              aria-label={`Remove ${getMemberDisplayName(member)}`}
              className="rounded-full px-1 hover:bg-foreground/10"
            >
              ×
            </button>
          </Badge>
        ))}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && availableMembers[0]) {
              event.preventDefault();
              addMember(availableMembers[0]._id);
            }
          }}
          className="min-w-32 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={selectedIds.length ? "Search…" : "Type a member name"}
        />
      </div>
      {query && availableMembers.length ? (
        <div className="rounded-md border bg-popover p-1 shadow-sm">
          {availableMembers.map((member) => (
            <Button
              key={member._id}
              type="button"
              variant="ghost"
              className="w-full justify-start font-normal"
              onClick={() => addMember(member._id)}
            >
              {getMemberDisplayName(member)}
            </Button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Search and select members. Press Enter to choose the first match.
      </p>
    </div>
  );
}
