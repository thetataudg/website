import type { LabelColor } from "./types";

/// Label swatches: a dot for the sidebar and a tinted chip for the list.
/// Written out whole so Tailwind keeps every class.
export const LABEL_COLORS: Array<{ id: LabelColor; name: string; dot: string; chip: string; text: string }> = [
  { id: "gray", name: "Gray", dot: "bg-zinc-400", chip: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300", text: "text-zinc-500" },
  { id: "red", name: "Red", dot: "bg-red-500", chip: "bg-red-500/15 text-red-700 dark:text-red-300", text: "text-red-500" },
  { id: "orange", name: "Orange", dot: "bg-orange-500", chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300", text: "text-orange-500" },
  { id: "yellow", name: "Yellow", dot: "bg-yellow-400", chip: "bg-yellow-400/20 text-yellow-800 dark:text-yellow-300", text: "text-yellow-500" },
  { id: "green", name: "Green", dot: "bg-green-500", chip: "bg-green-500/15 text-green-700 dark:text-green-300", text: "text-green-600 dark:text-green-500" },
  { id: "teal", name: "Teal", dot: "bg-teal-500", chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300", text: "text-teal-600 dark:text-teal-400" },
  { id: "blue", name: "Blue", dot: "bg-blue-500", chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300", text: "text-blue-600 dark:text-blue-400" },
  { id: "purple", name: "Purple", dot: "bg-purple-500", chip: "bg-purple-500/15 text-purple-700 dark:text-purple-300", text: "text-purple-600 dark:text-purple-400" },
  { id: "pink", name: "Pink", dot: "bg-pink-500", chip: "bg-pink-500/15 text-pink-700 dark:text-pink-300", text: "text-pink-600 dark:text-pink-400" },
];

export function labelColor(id: string) {
  return LABEL_COLORS.find((c) => c.id === id) ?? LABEL_COLORS[0];
}
