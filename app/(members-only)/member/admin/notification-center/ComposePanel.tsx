"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  Check,
  ImagePlus,
  Loader2,
  Mail,
  Search,
  Send,
  Smartphone,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { prepareImageForUpload } from "@/lib/prepareImageUpload";
import {
  AUDIENCE_GROUPS,
  BROADCAST_CHANNELS,
  resolveAudience,
  type AudienceSelection,
} from "@/lib/notify/broadcastAudience";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Roster, RosterMember } from "./types";

const TITLE_MAX = 80;
const BODY_MAX = 1000;
const PUSH_PREVIEW_MAX = 240;

const CHANNEL_ICONS = { push: Smartphone, inapp: Bell, email: Mail } as const;

type StatusFilter = "All" | "Active" | "Alumni";

export default function ComposePanel({
  roster,
  onSent,
}: {
  roster: Roster;
  onSent: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [channels, setChannels] = useState<string[]>(["push", "inapp"]);
  const [selection, setSelection] = useState<AudienceSelection>({
    groups: [],
    committeeIds: [],
    memberIds: [],
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState<"send" | "test" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const audience = useMemo(
    () => resolveAudience(roster.members, selection),
    [roster.members, selection]
  );
  const audienceIds = useMemo(() => new Set(audience.map((m) => m._id)), [audience]);
  const picked = useMemo(() => new Set(selection.memberIds), [selection.memberIds]);

  const reach = useMemo(
    () => ({
      push: audience.filter((m) => m.hasDevice).length,
      inapp: audience.filter((m) => m.hasAccount).length,
      email: audience.filter((m) => m.hasEmail).length,
    }),
    [audience]
  );

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster.members.filter((member) => {
      if (statusFilter !== "All" && member.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        member.name.toLowerCase().includes(needle) ||
        member.rollNo.toLowerCase().includes(needle) ||
        member.ecouncilPosition.toLowerCase().includes(needle)
      );
    });
  }, [roster.members, query, statusFilter]);

  const toggle = (key: keyof AudienceSelection, id: string) =>
    setSelection((current) => {
      const next = new Set(current[key]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...current, [key]: Array.from(next) };
    });

  const selectAllVisible = () =>
    setSelection((current) => ({
      ...current,
      memberIds: Array.from(
        new Set([...current.memberIds, ...visibleMembers.map((m) => m._id)])
      ),
    }));

  const clearAudience = () =>
    setSelection({ groups: [], committeeIds: [], memberIds: [] });

  const toggleChannel = (id: string) =>
    setChannels((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const prepared = await prepareImageForUpload(file);
      const form = new FormData();
      form.append("file", prepared);
      const res = await fetch("/api/admin/notification-center/images", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setImage({ key: data.imageKey, url: data.imageUrl });
    } catch (err: any) {
      toast.error(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const problems = [
    !title.trim() && "Add a title.",
    !body.trim() && "Add a message.",
    link.trim() && !link.trim().startsWith("/") && "Links start with a slash, like /member/events.",
    !channels.length && "Choose at least one channel.",
  ].filter(Boolean) as string[];
  const canTest = problems.length === 0 && !uploading && sending === null;
  const canSend = canTest && audience.length > 0;

  async function send(test: boolean) {
    setSending(test ? "test" : "send");
    try {
      const res = await fetch("/api/admin/notification-center/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          link: link.trim(),
          imageKey: image?.key ?? "",
          channels,
          audience: selection,
          test,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The message could not be sent.");
      if (test) {
        toast.success("Test sent to you.");
      } else {
        toast.success(
          `Sending to ${data.recipientCount} ${data.recipientCount === 1 ? "person" : "people"}.`
        );
        setTitle("");
        setBody("");
        setLink("");
        setImage(null);
        clearAudience();
      }
      onSent(data.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(null);
      setConfirming(false);
    }
  }

  const pushPreview =
    body.replace(/\s+/g, " ").trim().length > PUSH_PREVIEW_MAX
      ? `${body.replace(/\s+/g, " ").trim().slice(0, PUSH_PREVIEW_MAX - 3)}...`
      : body.replace(/\s+/g, " ").trim();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        {/* Message */}
        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="nc-title">Title</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {title.length}/{TITLE_MAX}
                </span>
              </div>
              <Input
                id="nc-title"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Chapter meeting moved to 7pm"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="nc-body">Message</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {body.length}/{BODY_MAX}
                </span>
              </div>
              <Textarea
                id="nc-body"
                value={body}
                maxLength={BODY_MAX}
                rows={5}
                onChange={(e) => setBody(e.target.value)}
                placeholder="We're in ECG 237 tonight instead of the usual room."
              />
              {body.replace(/\s+/g, " ").trim().length > PUSH_PREVIEW_MAX ? (
                <p className="text-xs text-muted-foreground">
                  Push shows the first {PUSH_PREVIEW_MAX} characters. In-app and email get
                  the full message.
                </p>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Thumbnail</Label>
                {image ? (
                  <div className="flex items-center gap-3 rounded-lg border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      className="size-14 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      Attached
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove thumbnail"
                      onClick={() => setImage(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ImagePlus className="size-4" />
                    )}
                    {uploading ? "Uploading..." : "Upload image"}
                  </Button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nc-link">
                  Link <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="nc-link"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="/member/events"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audience */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Audience</CardTitle>
              <CardDescription>
                Groups, committees and individual members combine.
              </CardDescription>
            </div>
            {audience.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearAudience}>
                Clear
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Groups</legend>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_GROUPS.map((group) => (
                  <ToggleChip
                    key={group.id}
                    active={selection.groups.includes(group.id)}
                    onClick={() => toggle("groups", group.id)}
                    title={group.description}
                  >
                    {group.label}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>

            {roster.committees.length ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Committees</legend>
                <div className="flex flex-wrap gap-2">
                  {roster.committees.map((committee) => (
                    <ToggleChip
                      key={committee._id}
                      active={selection.committeeIds.includes(committee._id)}
                      onClick={() => toggle("committeeIds", committee._id)}
                    >
                      {committee.name}
                    </ToggleChip>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-sm font-medium sm:flex-1">Members</span>
                <div className="flex gap-2">
                  <div className="relative flex-1 sm:w-64 sm:flex-none">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search name, roll, position"
                      className="pl-8"
                      aria-label="Search members"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="h-10 rounded-md border bg-background px-2 text-sm"
                    aria-label="Filter by status"
                  >
                    <option value="All">All</option>
                    <option value="Active">Actives</option>
                    <option value="Alumni">Alumni</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {visibleMembers.length} shown, {selection.memberIds.length} picked
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={selectAllVisible}
                    disabled={!visibleMembers.length}
                  >
                    Select all shown
                  </Button>
                  {selection.memberIds.length ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelection((s) => ({ ...s, memberIds: [] }))}
                    >
                      Clear picks
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-lg border">
                {visibleMembers.length ? (
                  <ul className="divide-y">
                    {visibleMembers.map((member) => (
                      <MemberRow
                        key={member._id}
                        member={member}
                        checked={picked.has(member._id)}
                        viaGroup={!picked.has(member._id) && audienceIds.has(member._id)}
                        onToggle={() => toggle("memberIds", member._id)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No members match.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Channels */}
        <Card>
          <CardHeader>
            <CardTitle>Send as</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {BROADCAST_CHANNELS.map((channel) => {
              const Icon = CHANNEL_ICONS[channel.id];
              const active = channels.includes(channel.id);
              const configured = roster.configured[channel.id] !== false;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => toggleChannel(channel.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary/5" : "hover:bg-accent"
                  )}
                >
                  <span className="flex items-center justify-between">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full border",
                        active && "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {active ? <Check className="size-3" /> : null}
                    </span>
                  </span>
                  <span className="font-medium">{channel.label}</span>
                  <span className="text-xs text-muted-foreground">{channel.description}</span>
                  {!configured ? (
                    <Badge variant="warning" className="w-fit">
                      Not configured
                    </Badge>
                  ) : audience.length ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      Reaches {reach[channel.id]} of {audience.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Preview + send */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-neutral-800 to-neutral-950 p-4">
            <p className="mb-3 text-center text-xs font-medium text-white/70">Lock screen</p>
            <div className="flex gap-3 rounded-2xl bg-white/80 p-3 shadow-sm backdrop-blur dark:bg-neutral-800/80">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#8b1b23] text-xs font-bold text-white"
              >
                ΘΤ
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                    {title.trim() || "Title"}
                  </p>
                  <span className="shrink-0 text-xs text-neutral-500">now</span>
                </div>
                <p className="line-clamp-4 whitespace-pre-line text-sm text-neutral-800 dark:text-neutral-200">
                  {pushPreview || "Your message"}
                </p>
              </div>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="" className="size-10 shrink-0 self-center rounded-md object-cover" />
              ) : null}
            </div>
          </div>
          <CardContent className="space-y-4 pt-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums">{audience.length}</p>
              <p className="text-sm text-muted-foreground">
                {audience.length === 1 ? "recipient" : "recipients"}
              </p>
            </div>

            {problems.length && (title || body) ? (
              <Alert>
                <AlertDescription>{problems[0]}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="button"
              className="w-full gap-2"
              disabled={!canSend}
              onClick={() => setConfirming(true)}
            >
              {sending === "send" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {audience.length
                ? `Send to ${audience.length} ${audience.length === 1 ? "person" : "people"}`
                : "Choose an audience"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!canTest}
              onClick={() => void send(true)}
            >
              {sending === "test" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Send test to me
            </Button>
          </CardContent>
        </Card>
      </aside>

      <AlertDialog open={confirming} onOpenChange={(open) => !sending && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {audience.length} {audience.length === 1 ? "person" : "people"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{title.trim()}&rdquo; goes out by{" "}
              {channels
                .map((c) => BROADCAST_CHANNELS.find((b) => b.id === c)?.label.toLowerCase())
                .join(", ")}
              . This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending !== null}
              onClick={(event) => {
                event.preventDefault();
                void send(false);
              }}
            >
              {sending === "send" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-accent"
      )}
    >
      {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function MemberRow({
  member,
  checked,
  viaGroup,
  onToggle,
}: {
  member: RosterMember;
  checked: boolean;
  viaGroup: boolean;
  onToggle: () => void;
}) {
  const id = `nc-member-${member._id}`;
  return (
    <li>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-accent/50"
      >
        <Checkbox
          id={id}
          checked={checked || viaGroup}
          onCheckedChange={onToggle}
          className={cn(viaGroup && "opacity-50")}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{member.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[member.rollNo, member.ecouncilPosition, member.status].filter(Boolean).join(" · ")}
          </span>
        </span>
        {viaGroup ? (
          <span className="shrink-0 text-xs text-muted-foreground">In a group</span>
        ) : null}
        <span className="flex shrink-0 gap-1.5 text-muted-foreground" aria-hidden="true">
          <Smartphone className={cn("size-3.5", !member.hasDevice && "opacity-20")} />
          <Mail className={cn("size-3.5", !member.hasEmail && "opacity-20")} />
        </span>
      </label>
    </li>
  );
}
