"use client";

// One fetch of the whole board, shared by every view, kept fresh by the live
// "tasks" stream. Filters and search run client-side over that list, which is
// small for a committee and keeps every view showing the same thing.
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useLive } from "@/components/live/useLive";
import { readCache, trackSync, useCacheKey, useIsoLayoutEffect, useOnFocus, writeCache } from "@/components/live/cachedFetch";
import type { TaskPriority, TaskStatus } from "@/lib/tasks/constants";
import type { TaskDTO, TrackerContext } from "@/lib/tasks/service";
import { applyPatch } from "./optimistic";

export interface TrackerFilters {
  status: TaskStatus[];
  assignee: string | "none" | null;
  priority: TaskPriority[];
  tag: string | null;
  due: "overdue" | "week" | "none" | null;
  q: string;
}

export const EMPTY_FILTERS: TrackerFilters = {
  status: [],
  assignee: null,
  priority: [],
  tag: null,
  due: null,
  q: "",
};

export type PickerField = "status" | "priority" | "assignees" | "due" | "tags";

interface TrackerValue {
  committeeParam: string | null;
  loading: boolean;
  error: string | null;
  tasks: TaskDTO[];
  context: TrackerContext | null;
  reload: () => Promise<void>;
  filters: TrackerFilters;
  setFilters: React.Dispatch<React.SetStateAction<TrackerFilters>>;
  applyFilters: (tasks: TaskDTO[]) => TaskDTO[];
  hrefFor: (path: string) => string;
  openKey: string | null;
  openTask: (key: string | null) => void;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  /// The current view tells the provider its visible order, for J/K.
  setVisibleKeys: (keys: string[]) => void;
  newTask: { status?: TaskStatus } | null;
  setNewTask: (value: { status?: TaskStatus } | null) => void;
  createTask: (input: Record<string, unknown>) => Promise<TaskDTO | null>;
  patchTask: (key: string, patch: Record<string, unknown>) => Promise<TaskDTO | null>;
  moveTask: (task: TaskDTO, status: TaskStatus, beforeId: string | null, afterId: string | null) => Promise<void>;
  createTag: (name: string) => Promise<string | null>;
  picker: { field: PickerField; nonce: number } | null;
  showShortcuts: boolean;
  setShowShortcuts: (open: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement>;
}

const TrackerCtx = React.createContext<TrackerValue | null>(null);

export function useTracker() {
  const value = React.useContext(TrackerCtx);
  if (!value) throw new Error("useTracker outside TrackerProvider");
  return value;
}

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const committeeParam = search.get("committee");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tasks, setTasks] = React.useState<TaskDTO[]>([]);
  const [context, setContext] = React.useState<TrackerContext | null>(null);
  const [filters, setFilters] = React.useState<TrackerFilters>(EMPTY_FILTERS);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [newTask, setNewTask] = React.useState<{ status?: TaskStatus } | null>(null);
  const [picker, setPicker] = React.useState<{ field: PickerField; nonce: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const visibleKeys = React.useRef<string[]>([]);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const query = committeeParam ? `committeeId=${encodeURIComponent(committeeParam)}` : "";

  const cacheKey = useCacheKey(`/api/tasks?${query}`);

  // The last copy of this board shows before paint; the fetch below refreshes it.
  useIsoLayoutEffect(() => {
    const cached = readCache<{ tasks: TaskDTO[]; context: TrackerContext }>(cacheKey);
    if (cached?.context) {
      setTasks(cached.tasks);
      setContext(cached.context);
      setLoading(false);
    }
  }, [cacheKey]);

  const reload = React.useCallback(async () => {
    if (!cacheKey) return;
    try {
      const json = await trackSync(fetch(`/api/tasks?${query}`, { cache: "no-store" }).then(readJson));
      setTasks(json.tasks);
      setContext(json.context);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load the tracker");
    } finally {
      setLoading(false);
    }
  }, [query, cacheKey]);

  React.useEffect(() => {
    void reload();
  }, [reload]);
  useLive("tasks", () => void reload());
  useOnFocus(() => void reload());

  // Keep the cached copy in step with every change, optimistic ones included.
  React.useEffect(() => {
    if (context) writeCache(cacheKey, { tasks, context });
  }, [cacheKey, tasks, context]);

  const hrefFor = React.useCallback(
    (path: string) => (committeeParam ? `${path}?committee=${encodeURIComponent(committeeParam)}` : path),
    [committeeParam]
  );

  const applyFilters = React.useCallback(
    (list: TaskDTO[]) => {
      const q = filters.q.trim().toLowerCase();
      const now = Date.now();
      return list.filter((t) => {
        if (t.archivedAt) return false;
        if (filters.status.length && !filters.status.includes(t.status)) return false;
        if (filters.priority.length && !filters.priority.includes(t.priority)) return false;
        if (filters.assignee === "none" && t.assigneeIds.length) return false;
        if (filters.assignee && filters.assignee !== "none" && !t.assigneeIds.includes(filters.assignee)) return false;
        if (filters.tag && !t.tagIds.includes(filters.tag)) return false;
        if (filters.due === "overdue" && t.dueState !== "overdue") return false;
        if (filters.due === "none" && t.dueAt) return false;
        if (filters.due === "week") {
          if (!t.dueAt) return false;
          const at = new Date(t.dueAt).getTime();
          if (at < now || at > now + 7 * 86_400_000) return false;
        }
        if (q && !t.title.toLowerCase().includes(q) && !t.key.toLowerCase().includes(q)) return false;
        return true;
      });
    },
    [filters]
  );

  const createTask = React.useCallback(
    async (input: Record<string, unknown>) => {
      try {
        const task = await readJson(
          await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ committeeId: committeeParam, ...input }),
          })
        );
        setTasks((list) => [...list, task]);
        return task as TaskDTO;
      } catch (err: any) {
        toast.error(err.message || "Could not create the task");
        return null;
      }
    },
    [committeeParam]
  );

  /// Optimistic: the board shows the change at once; the server's copy
  /// replaces it, or the old task comes back with an error toast.
  const patchTask = React.useCallback(
    async (key: string, patch: Record<string, unknown>) => {
      let before: TaskDTO | undefined;
      setTasks((list) =>
        list.map((t) => {
          if (t.key !== key) return t;
          before = t;
          return applyPatch(t, patch);
        })
      );
      try {
        const task = await trackSync(
          fetch(`/api/tasks/${encodeURIComponent(key)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }).then(readJson)
        );
        setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));
        return task as TaskDTO;
      } catch (err: any) {
        if (before) setTasks((list) => list.map((t) => (t.key === key ? before! : t)));
        toast.error(err.message || "Could not save. Your change was undone.");
        return null;
      }
    },
    []
  );

  const moveTask = React.useCallback(
    async (task: TaskDTO, status: TaskStatus, beforeId: string | null, afterId: string | null) => {
      // Optimistic: the card lands where it was dropped before the server answers.
      setTasks((list) => {
        const order = (id: string | null) => list.find((t) => t.id === id)?.sortOrder;
        const b = order(beforeId);
        const a = order(afterId);
        const sortOrder =
          b !== undefined && a !== undefined ? (a + b) / 2 : b !== undefined ? b + 1024 : a !== undefined ? a - 1024 : 0;
        return list.map((t) => (t.id === task.id ? { ...t, status, sortOrder } : t));
      });
      try {
        await readJson(
          await fetch(`/api/tasks/${encodeURIComponent(task.key)}/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, beforeId, afterId }),
          })
        );
      } catch (err: any) {
        toast.error(err.message || "Could not move the task");
      }
      void reload();
    },
    [reload]
  );

  const createTag = React.useCallback(
    async (name: string) => {
      try {
        const tag = await readJson(
          await fetch(`/api/tasks/tags?${query}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          })
        );
        setContext((c) => (c && !c.tags.some((t) => t.id === tag.id) ? { ...c, tags: [...c.tags, tag] } : c));
        return tag.id as string;
      } catch (err: any) {
        toast.error(err.message || "Could not create the tag");
        return null;
      }
    },
    [query]
  );

  const openTask = React.useCallback((key: string | null) => {
    setOpenKey(key);
    if (key) setSelectedKey(key);
  }, []);

  // ------------------------------------------------------------ shortcuts
  // Only while the tracker has the page and nothing editable has focus.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const editing =
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.getAttribute("role") === "combobox");
      if (event.key === "Escape") {
        if (showShortcuts) setShowShortcuts(false);
        return; // dialogs and sheets close themselves on Escape
      }
      if (editing) return;
      // A dialog other than the task sheet owns the keyboard.
      if (document.querySelector('[role="dialog"]:not([data-task-sheet])') && !showShortcuts) return;

      const keys = visibleKeys.current;
      const current = openKey || selectedKey;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const go = (delta: number) => {
        if (!keys.length) return;
        const index = current ? keys.indexOf(current) : -1;
        const next = keys[Math.max(0, Math.min(keys.length - 1, index + delta))] ?? keys[0];
        setSelectedKey(next);
        if (openKey) setOpenKey(next);
        document.querySelector(`[data-task-key="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
      };
      const ask = (field: PickerField) => {
        if (!current) return;
        if (!openKey) setOpenKey(current);
        setPicker({ field, nonce: Date.now() });
      };

      switch (key) {
        case "c":
          event.preventDefault();
          setNewTask({});
          break;
        case "/":
          event.preventDefault();
          searchRef.current?.focus();
          break;
        case "j":
          event.preventDefault();
          go(1);
          break;
        case "k":
          event.preventDefault();
          go(-1);
          break;
        case "Enter":
          if (selectedKey && !openKey) {
            event.preventDefault();
            setOpenKey(selectedKey);
          }
          break;
        case "s":
          event.preventDefault();
          ask("status");
          break;
        case "p":
          event.preventDefault();
          ask("priority");
          break;
        case "a":
          event.preventDefault();
          ask("assignees");
          break;
        case "d":
          event.preventDefault();
          ask("due");
          break;
        case "l":
          event.preventDefault();
          ask("tags");
          break;
        case "?":
          event.preventDefault();
          setShowShortcuts(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey, selectedKey, showShortcuts]);

  // A task opened from the URL (?task=TTDG-7K2M) opens in the sheet.
  React.useEffect(() => {
    const fromUrl = search.get("task");
    if (fromUrl) {
      setOpenKey(fromUrl);
      const params = new URLSearchParams(search.toString());
      params.delete("task");
      router.replace(`${pathname}${params.toString() ? `?${params}` : ""}`);
    }
  }, [search, pathname, router]);

  const value: TrackerValue = {
    committeeParam,
    loading,
    error,
    tasks,
    context,
    reload,
    filters,
    setFilters,
    applyFilters,
    hrefFor,
    openKey,
    openTask,
    selectedKey,
    setSelectedKey,
    setVisibleKeys: (keys) => {
      visibleKeys.current = keys;
    },
    newTask,
    setNewTask,
    createTask,
    patchTask,
    moveTask,
    createTag,
    picker,
    showShortcuts,
    setShowShortcuts,
    searchRef,
  };

  return <TrackerCtx.Provider value={value}>{children}</TrackerCtx.Provider>;
}
