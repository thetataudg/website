// app/(members-only)/member/admin/pending/PendingList.tsx
"use client";

import { useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  CircleAlert,
  ClipboardList,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { LoadingSpinner } from "../../../components/LoadingState";
import { cn } from "@/lib/utils";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

/** Radix `SelectItem` rejects `value=""`; state still stores "" for unselected. */
const NONE = "__none__";

type ReviewSection = "profile" | "access" | "highlights" | "experience";

/** Same sidebar as the create/edit profile modals. */
const REVIEW_SECTIONS: Array<{
  value: ReviewSection;
  label: string;
  icon: typeof UserRound;
}> = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "access", label: "Access & chapter", icon: ShieldCheck },
  { value: "highlights", label: "Links & highlights", icon: Link2 },
  { value: "experience", label: "Experience", icon: BriefcaseBusiness },
];

interface PendingRequest {
  requestType?: "access" | "deletion";
  _id: string;
  clerkId: string;
  rollNo: string;
  fName: string;
  lName: string;
  headline?: string;
  pronouns?: string;
  majors?: string[];
  minors?: string[];
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
  gradYear?: number;
  bio?: string;
  pledgeClass?: string;
  hometown?: string;
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
  socialLinks?: Record<string, string>;
  preferredStatus?: "Active" | "Alumni" | "Removed" | "Deceased";
  preferredRole?: "superadmin" | "admin" | "member";
}

interface Props {
  initialRequests: PendingRequest[];
}

export default function PendingList({ initialRequests }: Props) {
  const [requests, setRequests] = useState<PendingRequest[]>(initialRequests);
  const [selected, setSelected] = useState<PendingRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<ReviewSection>("profile");
  const [confirmReject, setConfirmReject] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    rollNo: "",
    fName: "",
    lName: "",
    headline: "",
    pronouns: "",
    majors: "",
    minors: "",
    gradYear: "",
    pledgeClass: "",
    hometown: "",
    bio: "",
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
    preferredStatus: "Active",
    preferredRole: "member",
  });

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

  const preferredStatusOptions = [
    "Active",
    "Alumni",
    "Removed",
    "Deceased",
  ];

  // "superadmin" is intentionally absent: the API rejects it from a client.
  const preferredRoleOptions = ["member", "admin"];

  const parseList = (text: string) =>
    text
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

  const updateField = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

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

  const openModal = (request: PendingRequest) => {
    setActiveSection("profile");
    setSelected(request);
    setError(null);
    const socials = request.socialLinks || {};
    setForm({
      rollNo: request.rollNo || "",
      fName: request.fName || "",
      lName: request.lName || "",
      headline: request.headline || "",
      pronouns: request.pronouns || "",
      majors: (request.majors || []).join(", "),
      minors: (request.minors || []).join(", "),
      gradYear: request.gradYear ? String(request.gradYear) : "",
      pledgeClass: request.pledgeClass || "",
      hometown: request.hometown || "",
      bio: request.bio || "",
      skills: (request.skills || []).join("\n"),
      funFacts: (request.funFacts || []).join("\n"),
      github: socials.github || "",
      linkedin: socials.linkedin || "",
      instagram: socials.instagram || "",
      website: socials.website || "",
      projects: (request.projects || []).map((p) => ({
        title: p.title || "",
        description: p.description || "",
        link: p.link || "",
      })),
      work: (request.work || []).map((w) => ({
        title: w.title || "",
        organization: w.organization || "",
        start: w.start || "",
        end: w.end || "",
        description: w.description || "",
        link: w.link || "",
      })),
      awards: (request.awards || []).map((a) => ({
        title: a.title || "",
        issuer: a.issuer || "",
        date: a.date || "",
        description: a.description || "",
      })),
      customSections: (request.customSections || []).map((s) => ({
        title: s.title || "",
        body: s.body || "",
      })),
      preferredStatus: request.preferredStatus || "Active",
      preferredRole: request.preferredRole || "member",
    });
  };

  async function review(id: string, action: "approve" | "reject") {
    const res = await fetch(`/api/members/pending/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      console.error("Failed to review:", await res.text());
      return;
    }
    setRequests((rs) => rs.filter((r) => r._id !== id));
  }

  const buildUpdates = () => {
    const gradYear = Number(form.gradYear);
    return {
      rollNo: form.rollNo.trim(),
      fName: form.fName.trim(),
      lName: form.lName.trim(),
      headline: form.headline.trim(),
      pronouns: form.pronouns.trim(),
      majors: parseList(form.majors),
      minors: parseList(form.minors),
      gradYear: Number.isFinite(gradYear) && gradYear ? gradYear : undefined,
      pledgeClass: form.pledgeClass.trim(),
      hometown: form.hometown.trim(),
      bio: form.bio,
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
      preferredStatus: form.preferredStatus,
      preferredRole: form.preferredRole,
    };
  };

  const saveUpdates = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/members/pending/${selected._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", updates: buildUpdates() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Failed to save updates.");
      setSaving(false);
      return;
    }
    const updated = (await res.json()) as PendingRequest;
    setRequests((rs) =>
      rs.map((r) => (r._id === selected._id ? { ...r, ...updated } : r))
    );
    setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
    setSaving(false);
  };

  const approveWithUpdates = async () => {
    if (!selected) return;
    setProcessing(true);
    setError(null);
    if (selected.requestType === "deletion") {
      await review(selected._id, "approve");
      setSelected(null);
      setProcessing(false);
      return;
    }
    const updateRes = await fetch(`/api/members/pending/${selected._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", updates: buildUpdates() }),
    });
    if (!updateRes.ok) {
      const data = await updateRes.json().catch(() => ({}));
      setError(data?.error || "Failed to update before approval.");
      setProcessing(false);
      return;
    }
    await review(selected._id, "approve");
    setSelected(null);
    setProcessing(false);
  };

  const rejectRequest = async () => {
    if (!selected) return;
    setProcessing(true);
    setError(null);
    await review(selected._id, "reject");
    setSelected(null);
    setProcessing(false);
  };


  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Account requests"
        description="Review requests to join the roster or remove an existing account."
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Pending requests</CardTitle>
          <CardDescription>
            {requests.length} request{requests.length === 1 ? "" : "s"} awaiting
            review.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28 pl-6">Roll</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden sm:table-cell">Submitted</TableHead>
                <TableHead className="w-28 pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length ? (
                requests.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="pl-6 font-mono text-sm">
                      #{r.rollNo}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.fName} {r.lName}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {r.requestType === "deletion" ? "Delete account" : "Request access"}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {r.submittedAt
                        ? new Date(r.submittedAt).toLocaleDateString()
                        : "Unknown"}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openModal(r)}
                      >
                        Review
                        <span className="sr-only">{` #${r.rollNo} ${r.fName} ${r.lName}`}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-56 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="rounded-full bg-muted p-3">
                        <ClipboardList className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">No pending requests</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Profiles submitted by members show up here for review.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !processing && !saving) setSelected(null);
          }}
        >
          {/* Same shell as the create/edit profile modals. */}
          <DialogContent
            className="flex h-[min(92vh,900px)] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14 text-left sm:px-6">
              <DialogTitle>
                {selected.requestType === "deletion" ? "Delete account for" : "Review"}{" "}
                #{selected.rollNo} {selected.fName} {selected.lName}
              </DialogTitle>
              <DialogDescription>
                {selected.requestType === "deletion"
                  ? "Their public profile was hidden when this request was submitted. Approving marks the member Removed; declining restores their account."
                  : "Edit anything that needs correcting, then approve or reject the request."}
              </DialogDescription>
            </DialogHeader>

            {error ? (
              <Alert variant="destructive" role="alert" className="m-4 mb-0 sm:mx-6">
                <CircleAlert className="size-4" />
                <AlertTitle>Unable to save</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Tabs
              value={activeSection}
              onValueChange={(value) =>
                setActiveSection(value as ReviewSection)
              }
              className="flex min-h-0 flex-1 flex-col md:flex-row"
            >
              <aside className="shrink-0 border-b bg-muted/30 p-3 md:w-60 md:border-b-0 md:border-r md:p-4">
                <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 md:flex-col md:items-stretch">
                  {REVIEW_SECTIONS.map((section) => {
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
                        <CardTitle className="text-base">
                          Profile basics
                        </CardTitle>
                        <CardDescription>
                          Personal details submitted with the request.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Field label="Headline or tagline" htmlFor="pr-headline">
                          <Input
                            id="pr-headline"
                            value={form.headline}
                            onChange={(e) =>
                              updateField("headline", e.target.value)
                            }
                          />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Pronouns" htmlFor="pr-pronouns">
                            <Input
                              id="pr-pronouns"
                              value={form.pronouns}
                              onChange={(e) =>
                                updateField("pronouns", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Hometown" htmlFor="pr-hometown">
                            <Input
                              id="pr-hometown"
                              value={form.hometown}
                              onChange={(e) =>
                                updateField("hometown", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Majors"
                            htmlFor="pr-majors"
                            description="Comma-separated"
                          >
                            <Input
                              id="pr-majors"
                              value={form.majors}
                              onChange={(e) =>
                                updateField("majors", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Minors"
                            htmlFor="pr-minors"
                            description="Comma-separated"
                          >
                            <Input
                              id="pr-minors"
                              value={form.minors}
                              onChange={(e) =>
                                updateField("minors", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Graduation year" htmlFor="pr-gradYear">
                            <Input
                              id="pr-gradYear"
                              type="number"
                              value={form.gradYear}
                              onChange={(e) =>
                                updateField("gradYear", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Pledge class" htmlFor="pr-pledgeClass">
                            <Select
                              value={form.pledgeClass || NONE}
                              onValueChange={(value) =>
                                updateField(
                                  "pledgeClass",
                                  value === NONE ? "" : value
                                )
                              }
                            >
                              <SelectTrigger id="pr-pledgeClass">
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
                        <Field label="Bio" htmlFor="pr-bio">
                          <Textarea
                            id="pr-bio"
                            rows={4}
                            value={form.bio}
                            onChange={(e) => updateField("bio", e.target.value)}
                          />
                        </Field>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── Access & chapter ── */}
                  <TabsContent value="access" className="mt-0 space-y-5">
                    <SectionHeading
                      title="Access & chapter"
                      description="Identity and the access this member will be granted on approval."
                    />
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Identity</CardTitle>
                        <CardDescription>
                          Roll number and name for the chapter roster.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field label="Roll No" htmlFor="pr-rollNo">
                            <Input
                              id="pr-rollNo"
                              value={form.rollNo}
                              onChange={(e) =>
                                updateField("rollNo", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="First name" htmlFor="pr-fName">
                            <Input
                              id="pr-fName"
                              value={form.fName}
                              onChange={(e) =>
                                updateField("fName", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Last name" htmlFor="pr-lName">
                            <Input
                              id="pr-lName"
                              value={form.lName}
                              onChange={(e) =>
                                updateField("lName", e.target.value)
                              }
                            />
                          </Field>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Membership</CardTitle>
                        <CardDescription>
                          Applied when the request is approved.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Status" htmlFor="pr-status">
                            <Select
                              value={form.preferredStatus}
                              onValueChange={(value) =>
                                updateField("preferredStatus", value)
                              }
                            >
                              <SelectTrigger id="pr-status">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {preferredStatusOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Role" htmlFor="pr-role">
                            <Select
                              value={form.preferredRole}
                              onValueChange={(value) =>
                                updateField("preferredRole", value)
                              }
                            >
                              <SelectTrigger id="pr-role">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {preferredRoleOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option.charAt(0).toUpperCase() +
                                      option.slice(1)}
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
                          <Field label="GitHub URL" htmlFor="pr-github">
                            <Input
                              id="pr-github"
                              value={form.github}
                              onChange={(e) =>
                                updateField("github", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="LinkedIn URL" htmlFor="pr-linkedin">
                            <Input
                              id="pr-linkedin"
                              value={form.linkedin}
                              onChange={(e) =>
                                updateField("linkedin", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Instagram URL" htmlFor="pr-instagram">
                            <Input
                              id="pr-instagram"
                              value={form.instagram}
                              onChange={(e) =>
                                updateField("instagram", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Personal website" htmlFor="pr-website">
                            <Input
                              id="pr-website"
                              value={form.website}
                              onChange={(e) =>
                                updateField("website", e.target.value)
                              }
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
                            htmlFor="pr-skills"
                            description="One per line"
                          >
                            <Textarea
                              id="pr-skills"
                              rows={4}
                              value={form.skills}
                              onChange={(e) =>
                                updateField("skills", e.target.value)
                              }
                            />
                          </Field>
                          <Field
                            label="Fun facts"
                            htmlFor="pr-funFacts"
                            description="One per line"
                          >
                            <Textarea
                              id="pr-funFacts"
                              rows={4}
                              value={form.funFacts}
                              onChange={(e) =>
                                updateField("funFacts", e.target.value)
                              }
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
                      emptyLabel="No projects submitted."
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
                      emptyLabel="No experience submitted."
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
                      emptyLabel="No awards submitted."
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
                      emptyLabel="No custom sections submitted."
                      count={form.customSections.length}
                    >
                      {form.customSections.map((section, index) => (
                        <EntryCard
                          key={`section-${index}`}
                          label={`Section ${index + 1}`}
                          onRemove={() =>
                            removeArrayItem("customSections", index)
                          }
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

                <DialogFooter className="shrink-0 gap-2 border-t bg-background p-4 sm:flex-row sm:justify-between sm:px-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelected(null)}
                    disabled={processing || saving}
                  >
                    Close
                  </Button>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={saveUpdates}
                      disabled={saving || processing || selected.requestType === "deletion"}
                    >
                      {saving && <LoadingSpinner size="sm" />}
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmReject(true)}
                      disabled={processing || saving}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="size-4" />
                      {selected.requestType === "deletion" ? "Keep account" : "Reject"}
                    </Button>
                    <Button
                      type="button"
                      onClick={approveWithUpdates}
                      disabled={processing || saving}
                    >
                      {processing ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      {processing
                        ? "Approving…"
                        : selected.requestType === "deletion"
                          ? "Mark Removed"
                          : "Approve"}
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      {/* Rejecting used to fire on a single click. */}
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected?.requestType === "deletion"
                ? "Keep this account?"
                : "Reject this request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected
                ? selected.requestType === "deletion"
                  ? `#${selected.rollNo} ${selected.fName} ${selected.lName} will keep access and their previous public-profile visibility will be restored.`
                  : `#${selected.rollNo} ${selected.fName} ${selected.lName} will not be added to the roster.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReject(false);
                void rejectRequest();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {selected?.requestType === "deletion" ? "Keep account" : "Reject request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/** Matches the profile editor's section heading. */
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
