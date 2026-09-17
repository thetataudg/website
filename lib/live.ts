// lib/live.ts
// Telling open tabs that something changed, the moment it changes.
//
// An in-process bus. The webhook that stores a new email and the stream a
// member's browser holds open run in the same server, so publishing here
// reaches that stream immediately. It is a fast path, not the only path: the
// stream also checks the database every few seconds, which is what covers a
// second server instance or a host that cuts long connections.
import { EventEmitter } from "events";

export type LiveTopic = "mail" | "notification";

const globalBus = globalThis as unknown as { __liveBus?: EventEmitter };
// Kept on globalThis so dev hot reloads don't split publishers and listeners
// across two emitters.
export const liveBus: EventEmitter = globalBus.__liveBus ?? (globalBus.__liveBus = new EventEmitter());
liveBus.setMaxListeners(0);

export function publishLive(memberId: unknown, topic: LiveTopic): void {
  if (!memberId) return;
  const id = String((memberId as any)?._id ?? memberId);
  liveBus.emit(`member:${id}`, topic);
}
