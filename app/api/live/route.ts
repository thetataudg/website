// app/api/live/route.ts
// A Server-Sent Events stream of "your mail changed" and "you have a new
// notification", so the navbar badge, the bell and the inbox update the moment
// a message arrives instead of on their next poll.
//
// Events carry no content, only which thing to refetch: the existing routes
// already do the permission checks and shaping, and a stream that repeated
// them would be a second place for those rules to drift.
import { auth } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/db";
import { liveBus, type LiveTopic } from "@/lib/live";
import MailMessage from "@/lib/models/MailMessage";
import Member from "@/lib/models/Member";
import Notification from "@/lib/models/Notification";
import { syncReceivedMail } from "@/lib/mail/sync";
import { accessibleMailboxes } from "@/lib/mail/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// How often the database is checked, for changes the bus didn't carry.
const CHECK_MS = 5_000;
/// A comment line keeps proxies from closing an idle connection.
const HEARTBEAT_MS = 20_000;
/// Ended on purpose so a stale connection can't live forever; the browser's
/// EventSource reconnects on its own.
const MAX_LIFETIME_MS = 10 * 60_000;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  await connectDB();
  const member = await Member.findOne({ clerkId: userId }).select("_id status").lean<any>();
  if (!member) return new Response("Forbidden", { status: 403 });
  const memberId = member._id;

  // Every mailbox they can open, re-read on each check: a committee mailbox
  // can arrive or leave while the tab is open.
  let accountIds = (await accessibleMailboxes(member)).map((m) => m._id);

  // What the page has already seen. A change in either is worth an event.
  const snapshot = async () => {
    accountIds = (await accessibleMailboxes(member)).map((m) => m._id);
    const has = accountIds.length > 0;
    const [latest, unreadMail, latestMail] = await Promise.all([
      Notification.findOne({ memberId }).sort({ createdAt: -1 }).select("createdAt").lean<any>(),
      has ? MailMessage.countDocuments({ accountId: { $in: accountIds }, folder: "inbox", read: false }) : 0,
      has ? MailMessage.findOne({ accountId: { $in: accountIds } }).sort({ updatedAt: -1 }).select("updatedAt").lean<any>() : null,
    ]);
    return {
      notification: latest?.createdAt ? new Date(latest.createdAt).getTime() : 0,
      mail: `${accountIds.map(String).join(",")}:${unreadMail}:${latestMail?.updatedAt ? new Date(latestMail.updatedAt).getTime() : 0}`,
    };
  };

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (topic: LiveTopic) => write(`event: ${topic}\ndata: {}\n\n`);

      let last = await snapshot().catch(() => ({ notification: 0, mail: "" }));
      write(`retry: 3000\nevent: ready\ndata: {}\n\n`);

      const onBus = (topic: LiveTopic) => send(topic);
      liveBus.on(`member:${memberId}`, onBus);

      const check = setInterval(async () => {
        try {
          // Throttled inside to once per 15 seconds per server, however many
          // tabs are open. Whatever it stores publishes to the bus itself.
          if (accountIds.length) await syncReceivedMail();
          const next = await snapshot();
          if (next.notification !== last.notification) send("notification");
          if (next.mail !== last.mail) send("mail");
          last = next;
        } catch {
          /* try again on the next tick */
        }
      }, CHECK_MS);
      const heartbeat = setInterval(() => write(`: keep-alive\n\n`), HEARTBEAT_MS);
      const lifetime = setTimeout(() => cleanup(), MAX_LIFETIME_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(check);
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        liveBus.off(`member:${memberId}`, onBus);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx-style proxies from buffering the stream into silence.
      "X-Accel-Buffering": "no",
    },
  });
}
