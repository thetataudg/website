// app/(members-only)/member/admin/profiles/CreateProfileModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PhotoUploader from "../../profile/[rollNo]/PhotoUploader";
import ResumeUploader from "../../profile/[rollNo]/ResumeUploader";
import {
  BriefcaseBusiness,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

import { LoadingSpinner } from "../../../components/LoadingState";
import type { MemberData } from "../members/MemberEditorModal";

import { cn } from "@/lib/utils";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type CreatorSection = "profile" | "access" | "highlights" | "experience";

/** Mirrors `MemberEditorModal`'s sidebar. No "History": a new profile has none. */
const CREATOR_SECTIONS: Array<{
  value: CreatorSection;
  label: string;
  icon: typeof UserRound;
}> = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "access", label: "Access & chapter", icon: ShieldCheck },
  { value: "highlights", label: "Links & highlights", icon: Link2 },
  { value: "experience", label: "Experience", icon: BriefcaseBusiness },
];

/** Radix `SelectItem` rejects `value=""`. State still stores "" for
 *  "none"/"unselected", which the save payload depends on. */
const NONE = "__none__";

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

const getMemberId = (value: any) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || "";
};

interface Props {
  show: boolean;
  onClose: () => void;
  onCreated: (member: MemberData) => void;
}

export default function CreateProfileModal({ show, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    rollNo: "",
    fName: "",
    lName: "",
    status: "Alumni",
    isHidden: false,
    isECouncil: false,
    ecouncilPosition: "",
    isCommitteeHead: false,
    familyLine: "",
    big: "",
    little: "",
    headline: "",
    pronouns: "",
    majors: "",
    minors: "",
    gradYear: "",
    bio: "",
    hometown: "",
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

  const [allMembers, setAllMembers] = useState<MemberData[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MemberData | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [activeSection, setActiveSection] = useState<CreatorSection>("profile");

  useEffect(() => {
    if (!show) return;
    setCreated(null);
    setError(null);
    setForm((f) => ({
      ...f,
      rollNo: "",
      fName: "",
      lName: "",
      gradYear: "",
      status: "Alumni",
      isHidden: false,
      isECouncil: false,
      ecouncilPosition: "",
      isCommitteeHead: false,
      familyLine: "",
      big: "",
      little: "",
      headline: "",
      pronouns: "",
      majors: "",
      minors: "",
      bio: "",
      hometown: "",
      pledgeClass: "",
      skills: "",
      funFacts: "",
      github: "",
      linkedin: "",
      instagram: "",
      website: "",
      projects: [],
      work: [],
      awards: [],
      customSections: [],
    }));

    fetch("/api/members")
      .then((r) => r.json())
      .then((list: MemberData[]) => {
        setAllMembers(list);
      })
      .catch(console.error);
  }, [show]);

  const update = <K extends keyof typeof form>(key: K, val: any) =>
    setForm((f) => ({ ...f, [key]: val }));

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

  const parseList = (text: string) =>
    text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

  const photoLabel = useMemo(
    () => (created?.profilePicUrl ? "Update Photo" : "Add Photo"),
    [created?.profilePicUrl]
  );
  const resumeLabel = useMemo(
    () => (created?.resumeUrl ? "Update Resume" : "Add Resume"),
    [created?.resumeUrl]
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const gradYear = Number(form.gradYear);
    if (!form.rollNo.trim() || !form.fName.trim() || !form.lName.trim() || !Number.isFinite(gradYear) || !gradYear) {
      setError("Roll No, first name, last name, and graduation year are required.");
      setSaving(false);
      return;
    }
    const payload = {
      rollNo: form.rollNo.trim(),
      fName: form.fName.trim(),
      lName: form.lName.trim(),
      status: form.status,
      isHidden: form.isHidden,
      isECouncil: form.isECouncil,
      ecouncilPosition: form.isECouncil ? form.ecouncilPosition : "",
      isCommitteeHead: form.isCommitteeHead,
      familyLine: form.familyLine,
      bigs: form.big ? [form.big] : [],
      littles: form.little ? [form.little] : [],
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
    } as Partial<MemberData> & { rollNo: string; fName: string; lName: string };

    try {
      const endpoint = created
        ? `/api/members/${created.rollNo}`
        : "/api/members";
      const method = created ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const data = JSON.parse(text);
          message = data?.error || message;
        } catch {
          // keep raw text
        }
        throw new Error(message || "Failed to save profile");
      }

      const saved = (await res.json()) as MemberData;
      setCreated(saved);
      setForm((f) => ({ ...f, rollNo: saved.rollNo }));
      onCreated(saved);
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  const initials =
    `${form.fName?.[0] ?? ""}${form.lName?.[0] ?? ""}`.toUpperCase();
  const relationOptions = allMembers.filter(
    (m) => m.rollNo !== created?.rollNo
  );

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !saving) onClose();
        }}
      >
        {/* Shell mirrors MemberEditorModal so create and edit read as one tool. */}
        <DialogContent
          className="flex h-[min(92vh,900px)] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
          /* No backdrop dismissal: a stray click would discard a long form.
           * Escape still closes, which the old Bootstrap shell did not. */
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14 text-left sm:px-6">
            <DialogTitle>Create member profile</DialogTitle>
            <DialogDescription>
              A filler profile for a brother who does not have an account yet.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive" role="alert" className="m-4 mb-0 sm:mx-6">
              <CircleAlert className="size-4" />
              <AlertTitle>Unable to save profile</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Tabs
            value={activeSection}
            onValueChange={(value) => setActiveSection(value as CreatorSection)}
            className="flex min-h-0 flex-1 flex-col md:flex-row"
          >
            <aside className="shrink-0 border-b bg-muted/30 p-3 md:w-60 md:border-b-0 md:border-r md:p-4">
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 md:flex-col md:items-stretch">
                {CREATOR_SECTIONS.map((section) => {
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
                {/* ── Profile ── */}
                <TabsContent value="profile" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Profile"
                    description="The details members see first on this profile."
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Profile media</CardTitle>
                      <CardDescription>
                        Photo and résumé shown on the member profile.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <Avatar className="size-24 border-2 border-primary/20">
                        {created?.profilePicUrl ? (
                          <AvatarImage src={created.profilePicUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="text-xl font-semibold">
                          {initials || (
                            <UserRound className="size-8" aria-hidden="true" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowPhotoModal(true)}
                          disabled={!created}
                        >
                          <ImageIcon className="size-4" />
                          {photoLabel}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowResumeModal(true)}
                          disabled={!created}
                        >
                          <FileText className="size-4" />
                          {resumeLabel}
                        </Button>
                      </div>
                    </CardContent>
                    {!created ? (
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground">
                          Save the profile first to upload files.
                        </p>
                      </CardContent>
                    ) : null}
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Profile basics</CardTitle>
                      <CardDescription>
                        Personal details displayed on the member profile.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Field label="Headline or tagline" htmlFor="cp-headline">
                        <Input
                          id="cp-headline"
                          value={form.headline}
                          onChange={(e) => update("headline", e.target.value)}
                          placeholder="Aspiring robotics engineer • Project lead"
                        />
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Pronouns" htmlFor="cp-pronouns">
                          <Input
                            id="cp-pronouns"
                            value={form.pronouns}
                            onChange={(e) => update("pronouns", e.target.value)}
                            placeholder="he/him, she/her, they/them"
                          />
                        </Field>
                        <Field label="Hometown" htmlFor="cp-hometown">
                          <Input
                            id="cp-hometown"
                            value={form.hometown}
                            onChange={(e) => update("hometown", e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Majors"
                          htmlFor="cp-majors"
                          description="Comma-separated"
                        >
                          <Input
                            id="cp-majors"
                            value={form.majors}
                            onChange={(e) => update("majors", e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Minors"
                          htmlFor="cp-minors"
                          description="Comma-separated"
                        >
                          <Input
                            id="cp-minors"
                            value={form.minors}
                            onChange={(e) => update("minors", e.target.value)}
                          />
                        </Field>
                        <Field label="Graduation year" htmlFor="cp-gradYear">
                          <Input
                            id="cp-gradYear"
                            type="number"
                            value={form.gradYear}
                            onChange={(e) => update("gradYear", e.target.value)}
                          />
                        </Field>
                        <Field label="Pledge class" htmlFor="cp-pledgeClass">
                          <Select
                            value={form.pledgeClass || NONE}
                            onValueChange={(value) =>
                              update("pledgeClass", value === NONE ? "" : value)
                            }
                          >
                            <SelectTrigger id="cp-pledgeClass">
                              <SelectValue placeholder="Select pledge class" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>
                                Select pledge class
                              </SelectItem>
                              {pledgeClassOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      <Field label="Bio" htmlFor="cp-bio">
                        <Textarea
                          id="cp-bio"
                          rows={4}
                          value={form.bio}
                          onChange={(e) => update("bio", e.target.value)}
                          placeholder="Share your story, interests, or what you're working on."
                        />
                      </Field>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Access & chapter ── */}
                <TabsContent value="access" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Access & chapter"
                    description="Identity, status, and chapter relationships."
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Identity</CardTitle>
                      <CardDescription>
                        Roll number and name for the chapter roster.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Roll No" htmlFor="cp-rollNo">
                          <Input
                            id="cp-rollNo"
                            value={form.rollNo}
                            onChange={(e) => update("rollNo", e.target.value)}
                          />
                        </Field>
                        <Field label="First name" htmlFor="cp-fName">
                          <Input
                            id="cp-fName"
                            value={form.fName}
                            onChange={(e) => update("fName", e.target.value)}
                          />
                        </Field>
                        <Field label="Last name" htmlFor="cp-lName">
                          <Input
                            id="cp-lName"
                            value={form.lName}
                            onChange={(e) => update("lName", e.target.value)}
                          />
                        </Field>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        aria-pressed={!form.isHidden}
                        onClick={() => update("isHidden", !form.isHidden)}
                        className="justify-start"
                      >
                        {form.isHidden ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                        {form.isHidden
                          ? "Hidden from public site"
                          : "Visible on public site"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Status & chapter role
                      </CardTitle>
                      <CardDescription>
                        Membership status and executive council service.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Status" htmlFor="cp-status">
                          <Select
                            value={form.status}
                            onValueChange={(value) => update("status", value)}
                          >
                            <SelectTrigger id="cp-status">
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
                        <Field label="Family line" htmlFor="cp-family">
                          <Input
                            id="cp-family"
                            value={form.familyLine}
                            onChange={(e) => update("familyLine", e.target.value)}
                          />
                        </Field>
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="isECouncil"
                          checked={form.isECouncil}
                          onCheckedChange={(value) =>
                            update("isECouncil", value === true)
                          }
                        />
                        <Label htmlFor="isECouncil">E-Council</Label>
                      </div>

                      {form.isECouncil && (
                        <Field label="E-Council position" htmlFor="cp-ecouncil">
                          <Input
                            id="cp-ecouncil"
                            value={form.ecouncilPosition}
                            onChange={(e) =>
                              update("ecouncilPosition", e.target.value)
                            }
                          />
                        </Field>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Relationships</CardTitle>
                      <CardDescription>
                        Big and little for the chapter family tree.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Big" htmlFor="cp-big">
                          <Select
                            value={form.big || NONE}
                            onValueChange={(value) =>
                              update("big", value === NONE ? "" : value)
                            }
                          >
                            <SelectTrigger id="cp-big">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>None</SelectItem>
                              {relationOptions.map((m) => (
                                <SelectItem key={m._id} value={getMemberId(m)}>
                                  {m.fName} {m.lName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Little" htmlFor="cp-little">
                          <Select
                            value={form.little || NONE}
                            onValueChange={(value) =>
                              update("little", value === NONE ? "" : value)
                            }
                          >
                            <SelectTrigger id="cp-little">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>None</SelectItem>
                              {relationOptions.map((m) => (
                                <SelectItem key={m._id} value={getMemberId(m)}>
                                  {m.fName} {m.lName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Links & highlights ── */}
                <TabsContent value="highlights" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Links & highlights"
                    description="External profiles and personal details shown on the profile."
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Links</CardTitle>
                      <CardDescription>
                        Public profiles linked from the member profile.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="GitHub URL" htmlFor="cp-github">
                          <Input
                            id="cp-github"
                            value={form.github}
                            onChange={(e) => update("github", e.target.value)}
                            placeholder="https://github.com/username"
                          />
                        </Field>
                        <Field label="LinkedIn URL" htmlFor="cp-linkedin">
                          <Input
                            id="cp-linkedin"
                            value={form.linkedin}
                            onChange={(e) => update("linkedin", e.target.value)}
                            placeholder="https://linkedin.com/in/username"
                          />
                        </Field>
                        <Field label="Instagram URL" htmlFor="cp-instagram">
                          <Input
                            id="cp-instagram"
                            value={form.instagram}
                            onChange={(e) => update("instagram", e.target.value)}
                            placeholder="https://instagram.com/username"
                          />
                        </Field>
                        <Field label="Personal website" htmlFor="cp-website">
                          <Input
                            id="cp-website"
                            value={form.website}
                            onChange={(e) => update("website", e.target.value)}
                            placeholder="https://your-site.com"
                          />
                        </Field>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Highlights</CardTitle>
                      <CardDescription>
                        Skills and fun facts, one per line.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Skills"
                          htmlFor="cp-skills"
                          description="One per line"
                        >
                          <Textarea
                            id="cp-skills"
                            rows={4}
                            value={form.skills}
                            onChange={(e) => update("skills", e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Fun facts"
                          htmlFor="cp-funFacts"
                          description="One per line"
                        >
                          <Textarea
                            id="cp-funFacts"
                            rows={4}
                            value={form.funFacts}
                            onChange={(e) => update("funFacts", e.target.value)}
                          />
                        </Field>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Experience ── */}
                <TabsContent value="experience" className="mt-0 space-y-5">
                  <SectionHeading
                    title="Experience"
                    description="Projects, work, awards, and custom profile sections."
                  />

                  <RepeatableCard
                    title="Projects"
                    description="Work this brother wants to show off."
                    addLabel="Add project"
                    onAdd={() => addArrayItem("projects")}
                    emptyLabel="No projects added."
                    count={form.projects.length}
                  >
                    {form.projects.map((project, index) => (
                      <EntryCard
                        key={`project-${index}`}
                        label={`Project ${index + 1}`}
                        onRemove={() => removeArrayItem("projects", index)}
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Project title"
                            aria-label={`Project ${index + 1} title`}
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
                          <Input
                            placeholder="Project link"
                            aria-label={`Project ${index + 1} link`}
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
                        </div>
                        <Textarea
                          rows={3}
                          placeholder="Short description"
                          aria-label={`Project ${index + 1} description`}
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
                      </EntryCard>
                    ))}
                  </RepeatableCard>

                  <RepeatableCard
                    title="Work & internships"
                    description="Roles held outside the chapter."
                    addLabel="Add experience"
                    onAdd={() => addArrayItem("work")}
                    emptyLabel="No experience added."
                    count={form.work.length}
                  >
                    {form.work.map((item, index) => (
                      <EntryCard
                        key={`work-${index}`}
                        label={`Experience ${index + 1}`}
                        onRemove={() => removeArrayItem("work", index)}
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Role title"
                            aria-label={`Experience ${index + 1} role title`}
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
                          <Input
                            placeholder="Organization"
                            aria-label={`Experience ${index + 1} organization`}
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
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Input
                            placeholder="Start (e.g. Aug 2023)"
                            aria-label={`Experience ${index + 1} start`}
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
                          <Input
                            placeholder="End (e.g. May 2024)"
                            aria-label={`Experience ${index + 1} end`}
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
                          <Input
                            placeholder="Link"
                            aria-label={`Experience ${index + 1} link`}
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
                        </div>
                        <Textarea
                          rows={3}
                          placeholder="Description"
                          aria-label={`Experience ${index + 1} description`}
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
                      </EntryCard>
                    ))}
                  </RepeatableCard>

                  <RepeatableCard
                    title="Awards & certifications"
                    description="Recognition worth surfacing on the profile."
                    addLabel="Add award"
                    onAdd={() => addArrayItem("awards")}
                    emptyLabel="No awards added."
                    count={form.awards.length}
                  >
                    {form.awards.map((award, index) => (
                      <EntryCard
                        key={`award-${index}`}
                        label={`Award ${index + 1}`}
                        onRemove={() => removeArrayItem("awards", index)}
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Title"
                            aria-label={`Award ${index + 1} title`}
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
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              placeholder="Issuer"
                              aria-label={`Award ${index + 1} issuer`}
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
                            <Input
                              placeholder="Date"
                              aria-label={`Award ${index + 1} date`}
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
                          </div>
                        </div>
                        <Textarea
                          rows={2}
                          placeholder="Description"
                          aria-label={`Award ${index + 1} description`}
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
                      </EntryCard>
                    ))}
                  </RepeatableCard>

                  <RepeatableCard
                    title="Custom sections"
                    description="Anything else worth adding to the profile."
                    addLabel="Add section"
                    onAdd={() => addArrayItem("customSections")}
                    emptyLabel="No custom sections added."
                    count={form.customSections.length}
                  >
                    {form.customSections.map((section, index) => (
                      <EntryCard
                        key={`section-${index}`}
                        label={`Section ${index + 1}`}
                        onRemove={() => removeArrayItem("customSections", index)}
                      >
                        <Input
                          placeholder="Section title"
                          aria-label={`Section ${index + 1} title`}
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
                        <Textarea
                          rows={3}
                          placeholder="Section body"
                          aria-label={`Section ${index + 1} body`}
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
                      </EntryCard>
                    ))}
                  </RepeatableCard>
                </TabsContent>
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t bg-background p-4 sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {saving
                    ? "Saving…"
                    : created
                    ? "Save changes"
                    : "Create profile"}
                </Button>
              </DialogFooter>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {showPhotoModal && created && (
        <PhotoUploader
          show={showPhotoModal}
          initialUrl={created.profilePicUrl}
          onError={(msg) => setError(msg)}
          onClose={() => setShowPhotoModal(false)}
          targetRollNo={created.rollNo}
        />
      )}
      {showResumeModal && created && (
        <ResumeUploader
          show={showResumeModal}
          initialUrl={created.resumeUrl}
          onError={(msg) => setError(msg)}
          onClose={() => setShowResumeModal(false)}
          targetRollNo={created.rollNo}
        />
      )}
    </>
  );
}

/** Matches MemberEditorModal's section heading. */
function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Label + control + optional description, programmatically associated. */
function Field({
  label,
  htmlFor,
  description,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/** A repeatable group rendered as a Card, matching the editor's Experience tab. */
function RepeatableCard({
  title,
  description,
  addLabel,
  onAdd,
  emptyLabel,
  count,
  children,
}: {
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  emptyLabel: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="shrink-0"
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      </CardHeader>
      <CardContent>
        {count ? (
          <div className="space-y-3">{children}</div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** One entry inside a repeatable group. */
function EntryCard({
  label,
  onRemove,
  children,
}: {
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">{`Remove ${label}`}</span>
          Remove
        </Button>
      </div>
      {children}
    </div>
  );
}
