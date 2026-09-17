"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveX,
  EllipsisVertical,
  File,
  Filter,
  Inbox,
  Mails,
  PenLine,
  Plus,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLive } from "@/components/live/useLive";
import ComposeDialog from "./ComposeDialog";
import MailboxSwitcher from "./MailboxSwitcher";
import FiltersDialog from "./FiltersDialog";
import SignaturesDialog from "./SignaturesDialog";
import LabelDialog from "./LabelDialog";
import MailDisplay, { type MailAction } from "./MailDisplay";
import { labelColor } from "./labelColors";
import { labelIcon } from "./labelIcons";
import MailList from "./MailList";
import { bulkForwardSeed, forwardSeed, replySeed } from "./format";
import type {
  AccountPayload,
  BulkMailAction,
  ComposeSeed,
  FilterCriteria,
  Folder,
  FolderCounts,
  MailDetail,
  MailConversation,
  MailLabel,
  MailListItem,
  MailSignature,
  SignatureDefaults,
  View,
} from "./types";

const FOLDERS: Array<{ id: Folder; label: string; icon: typeof Inbox; count?: "unread" | "total" }> = [
  { id: "inbox", label: "Inbox", icon: Inbox, count: "unread" },
  { id: "starred", label: "Starred", icon: Star },
  { id: "drafts", label: "Drafts", icon: File, count: "total" },
  { id: "sent", label: "Sent", icon: Send },
  { id: "junk", label: "Junk", icon: ArchiveX, count: "unread" },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "all", label: "All Mail", icon: Mails },
];

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

export default function MailApp({
  data,
  onSwitchMailbox,
  onRequestPersonal,
}: {
  data: AccountPayload;
  onSwitchMailbox: (id: string) => void;
  onRequestPersonal?: () => void;
}) {
  const account = data.current ?? data.account!;
  const mailboxes = data.mailboxes ?? [];
  const desktop = useIsDesktop();
  const [folder, setFolder] = useState<View>("inbox");
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});
  const [labelDialog, setLabelDialog] = useState<{ label: MailLabel | null; applyTo?: string } | null>(null);
  const [deletingLabel, setDeletingLabel] = useState<MailLabel | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [signatures, setSignatures] = useState<MailSignature[]>([]);
  const [signatureDefaults, setSignatureDefaults] = useState<SignatureDefaults>({ newMail: null, reply: null });
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [signaturesReady, setSignaturesReady] = useState(false);
  const [filterPrefill, setFilterPrefill] = useState<Partial<FilterCriteria> | null>(null);
  const viewLabelId = folder.startsWith("label:") ? folder.slice(6) : "";
  const [items, setItems] = useState<MailListItem[]>([]);
  const [counts, setCounts] = useState<FolderCounts>({});
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [currentBefore, setCurrentBefore] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([]);
  const [totalConversations, setTotalConversations] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailConversation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [focusedMessage, setFocusedMessage] = useState(false);
  const [compose, setCompose] = useState<ComposeSeed | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const listRequest = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!focusedMessage) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedMessage(false);
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [focusedMessage]);

  useEffect(() => {
    if (!selectedId) setFocusedMessage(false);
  }, [selectedId]);

  const loadList = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      const id = ++listRequest.current;
      if (!opts.quiet) setLoadingList(true);
      const params = new URLSearchParams(viewLabelId ? { label: viewLabelId } : { folder });
      if (unreadOnly) params.set("unread", "1");
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (currentBefore) params.set("before", currentBefore);
      try {
        const res = await fetch(`/api/mail/messages?${params}`);
        const body = await res.json();
        if (id !== listRequest.current) return;
        if (!res.ok) throw new Error(body.error);
        setItems(body.items);
        setCounts(body.counts);
        setLabelCounts(body.labelCounts ?? {});
        setNextBefore(body.nextBefore);
        setTotalConversations(body.total ?? body.items.length);
      } catch {
        if (id === listRequest.current && !opts.quiet) toast.error("Couldn't load your mail.");
      } finally {
        if (id === listRequest.current) setLoadingList(false);
      }
    },
    [folder, viewLabelId, unreadOnly, debouncedQuery, currentBefore]
  );

  // Keeps the navbar badge in step the moment the inbox count changes here.
  const inboxUnread = counts.inbox?.unread;
  useEffect(() => {
    if (inboxUnread === undefined) return;
    window.dispatchEvent(new CustomEvent("chapter-mail-unread", { detail: inboxUnread }));
  }, [inboxUnread]);

  const loadLabels = useCallback(async () => {
    const res = await fetch("/api/mail/labels");
    const body = await res.json().catch(() => ({}));
    if (res.ok) setLabels(body.labels ?? []);
  }, []);

  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/mail/signatures");
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSignatures(body.signatures ?? []);
        setSignatureDefaults(body.defaults ?? { newMail: null, reply: null });
      }
      // Ready even on failure: a composer shouldn't wait forever for a signature.
      setSignaturesReady(true);
    })();
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, unreadOnly, debouncedQuery, currentBefore]);

  // New mail arrives by webhook, and the live stream says so straight away.
  useLive("mail", () => void loadList({ quiet: true }));

  // A slower quiet refresh behind the stream, in case it is down.
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void loadList({ quiet: true });
    }, 30_000);
    return () => clearInterval(tick);
  }, [loadList]);

  async function patch(id: string, body: Record<string, any>) {
    const res = await fetch(`/api/mail/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Update failed");
  }

  async function toggleListStar(item: MailListItem) {
    const next = !item.starred;
    setItems((list) => list.map((row) => (row.id === item.id ? { ...row, starred: next } : row)));
    try {
      await patch(item.id, { starred: next });
      if (folder === "starred" && !next) void loadList({ quiet: true });
    } catch {
      setItems((list) => list.map((row) => (row.id === item.id ? { ...row, starred: item.starred } : row)));
      toast.error("Couldn't change that star.");
    }
  }

  async function executeBulk(action: BulkMailAction) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/mail/messages/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The bulk action failed.");
      const messages: Record<BulkMailAction, string> = {
        archive: "Archived selected messages",
        junk: "Reported selected messages as junk",
        trash: "Moved selected messages to Trash",
        inbox: "Moved selected messages to Inbox",
        read: "Marked selected messages as read",
        unread: "Marked selected messages as unread",
        star: "Starred selected messages",
        unstar: "Removed stars from selected messages",
        delete: "Deleted selected messages",
      };
      toast.success(messages[action]);
      setSelectedIds(new Set());
      setSelectedId(null);
      setDetail(null);
      await loadList({ quiet: true });
    } catch (err: any) {
      toast.error(err.message || "The bulk action failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  function bulkAction(action: BulkMailAction) {
    if (action === "delete") {
      const selected = items.filter((item) => selectedIds.has(item.id));
      if (selected.some((item) => ["trash", "drafts"].includes(item.folder))) {
        setConfirmBulkDelete(true);
        return;
      }
    }
    void executeBulk(action);
  }

  async function forwardSelected() {
    const selected = items.filter((item) => selectedIds.has(item.id));
    if (!selected.length) return;
    if (selected.length > 20) return toast.error("Select up to 20 messages to forward at once.");
    setBulkBusy(true);
    try {
      const details = await Promise.all(
        selected.map(async (item) => {
          const res = await fetch(`/api/mail/messages/${item.id}`);
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.message) throw new Error("Couldn't prepare the selected messages.");
          return body.message as MailDetail;
        })
      );
      setCompose(bulkForwardSeed(details));
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err.message || "Couldn't prepare the selected messages.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function openItem(item: MailListItem) {
    if (item.folder === "drafts") {
      const res = await fetch(`/api/mail/messages/${item.id}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) return toast.error("Couldn't open the draft.");
      const d: MailDetail = body.message;
      setCompose({
        mode: "draft",
        draftId: d.id,
        to: d.to,
        cc: d.cc,
        bcc: d.bcc,
        subject: d.subject === "(no subject)" ? "" : d.subject,
        replyToId: d.replyToId,
        forwardOfId: d.forwardOfId,
        includeQuote: d.includeQuote,
        quoted: body.quoted ?? undefined,
        text: d.text,
        html: d.html,
        attachments: d.attachments
          .filter((a) => a.key)
          .map((a) => ({ key: a.key!, filename: a.filename, contentType: a.contentType, size: a.size })),
      });
      return;
    }
    setSelectedId(item.id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/mail/messages/${item.id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setDetail({ message: body.message, thread: body.thread ?? [body.message], people: body.people ?? {} });
      if (!item.read) {
        await patch(item.id, { read: true, thread: true }).catch(() => undefined);
        setItems((list) => list.map((i) => (i.threadId === item.threadId ? { ...i, read: true } : i)));
        setCounts((c) => {
          const f = c[item.folder];
          return f ? { ...c, [item.folder]: { ...f, unread: Math.max(0, f.unread - 1) } } : c;
        });
      }
    } catch {
      toast.error("Couldn't open that message.");
      setSelectedId(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function toggleLabel(labelId: string, on: boolean) {
    const message = detail?.message;
    if (!message) return;
    try {
      await patch(message.id, { thread: true, [on ? "addLabels" : "removeLabels"]: [labelId] });
      const apply = (list: string[]) =>
        on ? Array.from(new Set([...list, labelId])) : list.filter((id) => id !== labelId);
      setDetail((d) =>
        d
          ? {
              ...d,
              message: { ...d.message, labels: apply(d.message.labels) },
              thread: d.thread.map((m) => ({ ...m, labels: apply(m.labels) })),
            }
          : d
      );
      setItems((list) => list.map((i) => (i.threadId === message.threadId ? { ...i, labels: apply(i.labels) } : i)));
      // Taking the label off in its own view takes the conversation out of it.
      if (!on && viewLabelId === labelId) {
        setSelectedId(null);
        setDetail(null);
        void loadList({ quiet: true });
      }
    } catch {
      toast.error("Couldn't change that label.");
    }
  }

  async function deleteLabel(label: MailLabel) {
    const res = await fetch(`/api/mail/labels/${label.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete that label.");
    setLabels((list) => list.filter((l) => l.id !== label.id));
    setItems((list) => list.map((i) => ({ ...i, labels: i.labels.filter((id) => id !== label.id) })));
    if (viewLabelId === label.id) {
      setFolder("inbox");
      setCurrentBefore(null);
      setPreviousCursors([]);
      setSelectedId(null);
      setDetail(null);
    }
    toast.success(`Deleted "${label.name}"`);
  }

  async function blockSender(address: string) {
    try {
      const res = await fetch("/api/mail/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: {
            from: address,
            to: "",
            subject: "",
            hasWords: "",
            doesNotHave: "",
            hasAttachment: false,
          },
          actions: {
            skipInbox: false,
            markRead: false,
            star: false,
            labelId: null,
            trash: true,
          },
          applyToExisting: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't block that sender.");
      toast.success(`Future mail from ${address} will go to Trash`);
    } catch (err: any) {
      toast.error(err.message || "Couldn't block that sender.");
    }
  }

  // A push or bell notification links to one message: /member/mail?message=<id>.
  // Open it once the mailbox is up, then drop the parameter so a refresh
  // doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("message");
    if (!id || !/^[a-f0-9]{24}$/i.test(id)) return;
    params.delete("message");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    void (async () => {
      const res = await fetch(`/api/mail/messages/${id}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.message) return toast.error("That message is no longer in your mailbox.");
      const m: MailDetail = body.message;
      void openItem({ ...m, read: m.read });
    })();
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(action: MailAction) {
    const message = detail?.message;
    if (!message) return;
    try {
      if (action === "delete") {
        await fetch(`/api/mail/messages/${message.id}`, { method: "DELETE" });
      } else if (action === "unread") {
        await patch(message.id, { read: false });
      } else if (action === "star") {
        await patch(message.id, { starred: !message.starred });
        setDetail((d) => (d ? { ...d, message: { ...d.message, starred: !message.starred } } : d));
        setItems((list) => list.map((i) => (i.id === message.id ? { ...i, starred: !message.starred } : i)));
        return;
      } else {
        await patch(message.id, { folder: action, thread: true });
      }
      const restored =
        message.direction === "out"
          ? "Moved to Sent"
          : message.folder === "junk"
            ? "Marked as not junk"
            : message.folder === "trash"
              ? "Restored to inbox"
              : "Moved to inbox";
      const messages: Record<MailAction, string> = {
        archive: "Archived",
        junk: "Reported as junk",
        trash: "Moved to trash",
        inbox: restored,
        unread: "Marked as unread",
        star: "",
        delete: "Deleted forever",
      };
      toast.success(messages[action]);
      setSelectedId(null);
      setDetail(null);
      void loadList({ quiet: true });
    } catch {
      toast.error("That didn't work. Try again.");
    }
  }

  const title = viewLabelId
    ? labels.find((l) => l.id === viewLabelId)?.name ?? "Label"
    : FOLDERS.find((f) => f.id === folder)?.label ?? "Inbox";

  const openView = (view: View) => {
    setFolder(view);
    setCurrentBefore(null);
    setPreviousCursors([]);
    setSelectedIds(new Set());
    setSelectedId(null);
    setDetail(null);
  };
  const countFor = (f: (typeof FOLDERS)[number]) => {
    if (!f.count) return 0;
    const row = counts[f.id];
    return row ? (f.count === "unread" ? row.unread : row.total) : 0;
  };

  const composeDialog = (
    <ComposeDialog
      seed={compose}
      fromAddress={account.address}
      signaturesReady={signaturesReady}
      signatures={signatures}
      signatureDefaults={signatureDefaults}
      onManageSignatures={() => setSignaturesOpen(true)}
      onClose={() => {
        setCompose(null);
        void loadList({ quiet: true });
      }}
      onSent={() => {
        setCompose(null);
        void loadList({ quiet: true });
        if (selectedId && detail) void openItem({ ...detail.message, read: true });
      }}
    />
  );

  const display = (
    <MailDisplay
      message={detail?.message ?? null}
      thread={detail?.thread ?? []}
      people={detail?.people ?? {}}
      ownAddress={account.address}
      addressActions={{
        onCompose: (address) => setCompose({ mode: "new", to: [address] }),
        onSearch: (address) => {
          setFolder("all");
          setUnreadOnly(false);
          setQuery(address);
          setCurrentBefore(null);
          setPreviousCursors([]);
          setSelectedId(null);
          setDetail(null);
        },
        onFilter: (address, field) => {
          setFilterPrefill(field === "from" ? { from: address } : { to: address });
          setFiltersOpen(true);
        },
        onBlock: (address) => void blockSender(address),
      }}
      loading={loadingDetail}
      onAction={act}
      onReply={(m) => setCompose(replySeed(m, account.address, false))}
      onReplyAll={(m) => setCompose(replySeed(m, account.address, true))}
      onForward={(m) => setCompose(forwardSeed(m))}
      onBack={desktop ? undefined : () => { setSelectedId(null); setDetail(null); }}
      labels={labels}
      onToggleLabel={toggleLabel}
      onNewLabel={() => setLabelDialog({ label: null, applyTo: detail?.message.id })}
      onFilterLike={(m) => {
        setFilterPrefill({ from: m.direction === "out" ? "" : m.from, to: m.direction === "out" ? m.to.join(", ") : "" });
        setFiltersOpen(true);
      }}
      focused={focusedMessage}
      onToggleFocus={desktop && detail?.message ? () => setFocusedMessage((focused) => !focused) : undefined}
    />
  );

  const list = (
    <MailList
      title={title}
      items={items}
      loading={loadingList}
      selectedId={selectedId}
      onSelect={openItem}
      unreadOnly={unreadOnly}
      onUnreadOnly={(value) => {
        setUnreadOnly(value);
        setCurrentBefore(null);
        setPreviousCursors([]);
      }}
      query={query}
      onQuery={(value) => {
        setQuery(value);
        setCurrentBefore(null);
        setPreviousCursors([]);
      }}
      page={previousCursors.length + 1}
      pageSize={20}
      total={totalConversations}
      hasNext={Boolean(nextBefore)}
      hasPrevious={previousCursors.length > 0}
      onNextPage={() => {
        if (!nextBefore) return;
        setPreviousCursors((cursors) => [...cursors, currentBefore]);
        setCurrentBefore(nextBefore);
        setSelectedIds(new Set());
        setSelectedId(null);
        setDetail(null);
      }}
      onPreviousPage={() => {
        if (!previousCursors.length) return;
        setCurrentBefore(previousCursors[previousCursors.length - 1] ?? null);
        setPreviousCursors((cursors) => cursors.slice(0, -1));
        setSelectedIds(new Set());
        setSelectedId(null);
        setDetail(null);
      }}
      labels={labels}
      hideLabelId={viewLabelId || undefined}
      showFolder={folder === "all" || Boolean(viewLabelId) || folder === "starred"}
      selectedIds={selectedIds}
      onToggleSelected={(id, selected) =>
        setSelectedIds((current) => {
          const next = new Set(current);
          if (selected) next.add(id);
          else next.delete(id);
          return next;
        })
      }
      onSelectAll={(ids, selected) => setSelectedIds(selected ? new Set(ids) : new Set())}
      onToggleStar={(item) => void toggleListStar(item)}
      onBulkAction={bulkAction}
      onBulkForward={() => void forwardSelected()}
      bulkBusy={bulkBusy}
    />
  );

  const dialogs = (
    <>
      {composeDialog}
      <LabelDialog
        open={Boolean(labelDialog)}
        label={labelDialog?.label ?? null}
        onClose={() => setLabelDialog(null)}
        onSaved={(saved) => {
          const applyTo = labelDialog?.applyTo;
          setLabelDialog(null);
          setLabels((list) =>
            [...list.filter((l) => l.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name))
          );
          // "Create new" from a message's label menu puts it on that message.
          if (applyTo && detail?.message.id === applyTo) void toggleLabel(saved.id, true);
        }}
      />
      <SignaturesDialog
        open={signaturesOpen}
        signatures={signatures}
        defaults={signatureDefaults}
        onClose={() => setSignaturesOpen(false)}
        onChange={(payload) => {
          setSignatures(payload.signatures);
          setSignatureDefaults(payload.defaults);
        }}
      />
      <FiltersDialog
        open={filtersOpen}
        labels={labels}
        prefill={filterPrefill}
        onClose={() => {
          setFiltersOpen(false);
          setFilterPrefill(null);
        }}
        onChanged={() => void loadList({ quiet: true })}
      />
      <AlertDialog open={Boolean(deletingLabel)} onOpenChange={(open) => !open && setDeletingLabel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingLabel?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The label comes off every conversation that has it. The conversations themselves aren&apos;t deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingLabel) void deleteLabel(deletingLabel);
                setDeletingLabel(null);
              }}
            >
              Delete label
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected messages permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages already in Trash or Drafts can&apos;t be recovered after this action. Other selected messages will be moved to Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmBulkDelete(false);
                void executeBulk("delete");
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (!desktop) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex h-[calc(100dvh-3.5rem-1px)] flex-col">
          {selectedId ? (
            display
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b p-3">
                <Select value={folder} onValueChange={(v) => openView(v as View)}>
                  <SelectTrigger className="w-40" aria-label="Folder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLDERS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                        {countFor(f) ? ` (${countFor(f)})` : ""}
                      </SelectItem>
                    ))}
                    {labels.map((l) => (
                      <SelectItem key={l.id} value={`label:${l.id}`}>
                        {l.name}
                        {labelCounts[l.id] ? ` (${labelCounts[l.id]})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="ml-auto" />
                <MailboxSwitcher
                  compact
                  current={account}
                  mailboxes={mailboxes}
                  onSwitch={onSwitchMailbox}
                  onRequestPersonal={onRequestPersonal}
                  personalStatus={data.account?.status}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Filters"
                  onClick={() => {
                    setFilterPrefill(null);
                    setFiltersOpen(true);
                  }}
                >
                  <Filter className="size-4" />
                </Button>
                <Button variant="outline" className="mail-nav-item mail-compose rounded-xl border-primary/25 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary" size="sm" onClick={() => setCompose({ mode: "new" })}>
                  <PenLine className="mail-nav-icon size-4" data-motion="compose" aria-hidden="true" /> Compose
                </Button>
              </div>
              <div className="min-h-0 flex-1">{list}</div>
            </>
          )}
          {dialogs}
        </div>
      </TooltipProvider>
    );
  }

  if (focusedMessage && detail?.message) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="h-[calc(100dvh-3.5rem-1px)] bg-background">
          {display}
        </div>
        {dialogs}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-[calc(100dvh-3.5rem-1px)] p-4">
        <div className="h-full overflow-hidden rounded-lg border bg-background">
          <ResizablePanelGroup direction="horizontal" autoSaveId="chapter-mail-layout">
            <ResizablePanel defaultSize={18} minSize={14} maxSize={26}>
              <div className="flex h-full flex-col">
                <div className="flex h-[52px] shrink-0 items-center px-1.5">
                  <MailboxSwitcher
                    current={account}
                    mailboxes={mailboxes}
                    onSwitch={onSwitchMailbox}
                    onRequestPersonal={onRequestPersonal}
                    personalStatus={data.account?.status}
                  />
                </div>
                <Separator />
                <div className="p-2">
                  <Button variant="outline" className="mail-nav-item mail-compose h-11 w-full justify-start rounded-xl border-primary/25 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary" onClick={() => setCompose({ mode: "new" })}>
                    <PenLine className="mail-nav-icon size-4" data-motion="compose" aria-hidden="true" /> Compose
                  </Button>
                </div>
                <nav className="grid gap-1 px-2" aria-label="Folders">
                  {FOLDERS.map((f) => {
                    const Icon = f.icon;
                    const n = countFor(f);
                    const active = folder === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => openView(f.id)}
                        className={cn(
                          "mail-nav-item flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                          active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="mail-nav-icon size-4" data-motion={f.id} aria-hidden="true" />
                        {f.label}
                        {n > 0 && <span className="ml-auto text-xs">{n}</span>}
                      </button>
                    );
                  })}
                </nav>

                <div className="mt-4 flex items-center justify-between px-5 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Labels</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Create new label"
                    onClick={() => setLabelDialog({ label: null })}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <nav className="grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto px-2" aria-label="Labels">
                  {labels.map((l) => {
                    const view = `label:${l.id}` as View;
                    const active = folder === view;
                    const n = labelCounts[l.id] ?? 0;
                    return (
                      <div
                        key={l.id}
                        className={cn(
                          "group flex h-9 items-center rounded-md text-sm font-medium transition-colors",
                          active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openView(view)}
                          className="mail-nav-item flex h-full min-w-0 flex-1 items-center gap-3 pl-3"
                          aria-current={active ? "page" : undefined}
                        >
                          {(() => {
                            const Icon = labelIcon(l.icon);
                            return (
                              <Icon
                                className={cn("mail-nav-icon size-4 shrink-0", !active && labelColor(l.color).text)}
                                data-motion="label"
                                aria-hidden="true"
                              />
                            );
                          })()}
                          <span className="truncate">{l.name}</span>
                          {n > 0 && <span className="ml-auto text-xs">{n}</span>}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-full w-8 shrink-0 items-center justify-center rounded-md opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                              aria-label={`Options for ${l.name}`}
                            >
                              <EllipsisVertical className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => setLabelDialog({ label: l })}>Edit label</DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setFilterPrefill(null);
                                setFiltersOpen(true);
                              }}
                            >
                              Add a filter
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingLabel(l)}>
                              Delete label
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </nav>
                <div className="shrink-0 border-t p-2">
                  <Button
                    variant="ghost"
                    className="mail-nav-item h-9 w-full justify-start gap-3 px-3"
                    onClick={() => {
                      setFilterPrefill(null);
                      setFiltersOpen(true);
                    }}
                  >
                    <Filter className="mail-nav-icon size-4" data-motion="filters" /> Filters
                  </Button>
                  <Button
                    variant="ghost"
                    className="mail-nav-item h-9 w-full justify-start gap-3 px-3"
                    onClick={() => setSignaturesOpen(true)}
                  >
                    <PenLine className="mail-nav-icon size-4" data-motion="drafts" /> Signatures
                  </Button>
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={34} minSize={26}>
              {list}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={48} minSize={30}>
              {display}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
      {dialogs}
    </TooltipProvider>
  );
}
