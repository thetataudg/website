// lib/mail/labels.ts
// Shapes and checks shared by the label routes.
import { LABEL_COLORS } from "@/lib/mail/filters";

/// The icons a label can wear. Keys, not component names: the mail UI maps
/// each one to its glyph, so this list and that map must stay in step.
export const LABEL_ICONS = [
  "tag", "briefcase", "graduation-cap", "users", "dollar-sign", "receipt",
  "calendar", "megaphone", "heart", "star", "flag", "bookmark", "trophy",
  "code", "home", "plane", "book", "handshake", "bell", "zap",
] as const;

export function toLabel(l: any) {
  return { id: String(l._id), name: l.name, color: l.color || "gray", icon: l.icon || "tag" };
}

export function readLabelBody(body: any): { name?: string; color?: string; icon?: string; error?: string } {
  const out: { name?: string; color?: string; icon?: string; error?: string } = {};
  if (body?.icon !== undefined) {
    if (!(LABEL_ICONS as readonly string[]).includes(String(body.icon))) return { error: "Unknown icon." };
    out.icon = String(body.icon);
  }
  if (body?.name !== undefined) {
    const name = String(body.name).replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) return { error: "Give the label a name." };
    out.name = name;
  }
  if (body?.color !== undefined) {
    if (!(LABEL_COLORS as readonly string[]).includes(String(body.color))) return { error: "Unknown color." };
    out.color = String(body.color);
  }
  return out;
}
