// What a task will look like once the server applies `patch`, so the UI can
// show it the moment someone clicks. The server's answer replaces it a beat
// later; on an error the caller puts the old task back.
import { DateTime } from "luxon";

import { TASK_ZONE } from "@/lib/tasks/constants";
import type { TaskDTO } from "@/lib/tasks/service";

const FIELDS = ["title", "description", "status", "priority", "assigneeIds", "tagIds"] as const;

export function applyPatch(task: TaskDTO, patch: Record<string, any>): TaskDTO {
  const next: TaskDTO = { ...task };
  for (const field of FIELDS) if (field in patch) (next as any)[field] = patch[field];
  if ("checklist" in patch) {
    next.checklist = (patch.checklist || []).map((item: any, i: number) => ({
      id: item.id || `pending-${i}-${item.text}`,
      text: item.text,
      done: Boolean(item.done),
      assigneeId: item.assigneeId ?? null,
    }));
  }
  if ("archived" in patch) next.archivedAt = patch.archived ? new Date().toISOString() : null;
  if ("dueDate" in patch) {
    if (!patch.dueDate) {
      next.dueAt = null;
      next.dueLabel = null;
      next.dueAllDay = true;
    } else {
      const dt = DateTime.fromISO(patch.dueDate, { zone: TASK_ZONE }).set({ hour: 23, minute: 59 });
      next.dueAt = dt.toISO();
      next.dueAllDay = true;
      next.dueLabel = dt.toFormat("LLL d");
    }
  }
  if ("dueAt" in patch) {
    next.dueAt = patch.dueAt;
    next.dueAllDay = patch.dueAllDay ?? false;
    next.dueLabel = patch.dueAt ? DateTime.fromISO(patch.dueAt).setZone(TASK_ZONE).toFormat("LLL d, h:mm a") : null;
  }
  if ("status" in patch && patch.status !== task.status) next.statusChangedAt = new Date().toISOString();
  return next;
}
