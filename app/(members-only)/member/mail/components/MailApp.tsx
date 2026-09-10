"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveX,
  File,
  Inbox,
  Mail,
  PenLine,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import ComposeDialog from "./ComposeDialog";
import MailDisplay from "./MailDisplay";
import MailList from "./MailList";
import { forwardSeed, replySeed } from "./format";
import type { AccountPayload, ComposeSeed, Folder, FolderCounts, MailDetail, MailListItem } from "./types";

const FOLDERS: Array<{ id: Folder; label: string; icon: typeof Inbox; count?: "unread" | "total" }> = [
  { id: "inbox", label: "Inbox", icon: Inbox, count: "unread" },
  { id: "starred", label: "Starred", icon: Star },
  { id: "drafts", label: "Drafts", icon: File, count: "total" },
  { id: "sent", label: "Sent", icon: Send },
  { id: "junk", label: "Junk", icon: ArchiveX, count: "unread" },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "archive", label: "Archive", icon: Archive },
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

export default function MailApp({ data }: { data: AccountPayload }) {
  const account = data.account!;
  const desktop = useIsDesktop();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [items, setItems] = useState<MailListItem[]>([]);
  const [counts, setCounts] = useState<FolderCounts>({});
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ message: MailDetail; thread: MailDetail[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [compose, setCompose] = useState<ComposeSeed | null>(null);
  const listRequest = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const loadList = useCallback(
    async (opts: { append?: boolean; quiet?: boolean } = {}) => {
      const id = ++listRequest.current;
      if (!opts.quiet) setLoadingList(true);
      const params = new URLSearchParams({ folder });
      if (unreadOnly) params.set("unread", "1");
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (opts.append && nextBefore) params.set("before", nextBefore);
      try {
        const res = await fetch(`/api/mail/messages?${params}`);
        const body = await res.json();
        if (id !== listRequest.current) return;
        if (!res.ok) throw new Error(body.error);
        setItems((current) => (opts.append ? [...current, ...body.items] : body.items));
        setCounts(body.counts);
        setNextBefore(body.nextBefore);
      } catch {
        if (id === listRequest.current && !opts.quiet) toast.error("Couldn't load your mail.");
      } finally {
        if (id === listRequest.current) setLoadingList(false);
      }
    },
    [folder, unreadOnly, debouncedQuery, nextBefore]
  );

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, unreadOnly, debouncedQuery]);

  // New mail arrives by webhook; a quiet refresh every 30 seconds while the
  // tab is visible picks it up without a socket.
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
      setDetail(body);
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

  async function act(action: "archive" | "junk" | "trash" | "inbox" | "unread" | "star" | "delete") {
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
        await patch(message.id, { folder: action, thread: message.direction === "in" });
      }
      const labels: Record<string, string> = {
        archive: "Archived",
        junk: "Moved to junk",
        trash: "Moved to trash",
        inbox: "Moved to inbox",
        unread: "Marked as unread",
        delete: "Deleted",
      };
      toast.success(labels[action]);
      setSelectedId(null);
      setDetail(null);
      void loadList({ quiet: true });
    } catch {
      toast.error("That didn't work. Try again.");
    }
  }

  const title = FOLDERS.find((f) => f.id === folder)?.label ?? "Inbox";
  const countFor = (f: (typeof FOLDERS)[number]) => {
    if (!f.count) return 0;
    const row = counts[f.id];
    return row ? (f.count === "unread" ? row.unread : row.total) : 0;
  };

  const composeDialog = (
    <ComposeDialog
      seed={compose}
      fromAddress={account.address}
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
      loading={loadingDetail}
      onAction={act}
      onReply={(m) => setCompose(replySeed(m, account.address, false))}
      onReplyAll={(m) => setCompose(replySeed(m, account.address, true))}
      onForward={(m) => setCompose(forwardSeed(m))}
      onBack={desktop ? undefined : () => { setSelectedId(null); setDetail(null); }}
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
      onUnreadOnly={setUnreadOnly}
      query={query}
      onQuery={setQuery}
      hasMore={Boolean(nextBefore)}
      onLoadMore={() => loadList({ append: true })}
    />
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
                <Select value={folder} onValueChange={(v) => { setFolder(v as Folder); setSelectedId(null); setDetail(null); }}>
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
                  </SelectContent>
                </Select>
                <Button variant="outline" className="ml-auto rounded-xl border-primary/25 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary" size="sm" onClick={() => setCompose({ mode: "new" })}>
                  <PenLine className="size-4" /> Compose
                </Button>
              </div>
              <div className="min-h-0 flex-1">{list}</div>
            </>
          )}
          {composeDialog}
        </div>
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
                <div className="flex h-[52px] shrink-0 items-center gap-2 px-3">
                  <Mail className="size-4 shrink-0" />
                  <span className="truncate text-sm font-medium" title={account.address}>
                    {account.address}
                  </span>
                </div>
                <Separator />
                <div className="p-2">
                  <Button variant="outline" className="h-11 w-full justify-start rounded-xl border-primary/25 bg-primary/10 text-primary shadow-sm hover:bg-primary/15 hover:text-primary" onClick={() => setCompose({ mode: "new" })}>
                    <PenLine className="size-4" /> Compose
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
                        onClick={() => {
                          setFolder(f.id);
                          setSelectedId(null);
                          setDetail(null);
                        }}
                        className={cn(
                          "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                          active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="size-4" />
                        {f.label}
                        {n > 0 && <span className="ml-auto text-xs">{n}</span>}
                      </button>
                    );
                  })}
                </nav>
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
      {composeDialog}
    </TooltipProvider>
  );
}
