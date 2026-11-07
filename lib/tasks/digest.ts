// lib/tasks/digest.ts
// The Monday digest's numbers and lines. Pure, so the checks can read it.
import { OPEN_STATUSES } from "./constants";
import { dueState, staleDays, staleLevel, taskKey } from "./logic";


export interface DigestInput {
  committee: any;
  tasks: any[];
  names: Map<string, string>;
  now: Date;
}

/// The digest's numbers and lines, pure so the checks can read it.
export function buildDigest({ committee, tasks, names, now }: DigestInput) {
  const key = (t: any) => taskKey(t);
  const who = (t: any) =>
    (t.assigneeIds || []).map((id: any) => names.get(String(id)) || "a former member").join(", ");
  const open = tasks.filter((t) => !t.archivedAt && OPEN_STATUSES.includes(t.status));
  const overdue = open.filter((t) => dueState(t, now) === "overdue");
  const stale = open.filter((t) => staleLevel(t, now));
  const unassigned = open.filter((t) => !(t.assigneeIds || []).length);
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const done = tasks.filter(
    (t) => t.status === "done" && t.completedAt && new Date(t.completedAt).getTime() >= weekAgo
  );
  const closedBy = new Map<string, number>();
  for (const t of done) {
    for (const id of t.assigneeIds || []) {
      const name = names.get(String(id)) || "a former member";
      closedBy.set(name, (closedBy.get(name) || 0) + 1);
    }
  }

  const lines: string[] = [];
  for (const t of overdue) lines.push(`Overdue: ${key(t)} ${t.title}${who(t) ? ` (${who(t)})` : ""}`);
  for (const t of stale) lines.push(`Stale ${staleDays(t, now)} days: ${key(t)} ${t.title}${who(t) ? ` (${who(t)})` : ""}`);
  for (const t of unassigned) lines.push(`Unassigned: ${key(t)} ${t.title}`);
  if (closedBy.size) {
    lines.push(
      `Closed this week: ${Array.from(closedBy.entries())
        .map(([name, n]) => `${name} ${n}`)
        .join(", ")}`
    );
  }
  return { overdue: overdue.length, stale: stale.length, done: done.length, lines };
}

