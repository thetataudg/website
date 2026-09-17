import {
  Bell,
  BookOpen,
  Bookmark,
  Briefcase,
  Calendar,
  Code,
  DollarSign,
  Flag,
  GraduationCap,
  Handshake,
  Heart,
  House,
  type LucideIcon,
  Megaphone,
  Plane,
  Receipt,
  Star,
  Tag,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

/// Keys match `LABEL_ICONS` in lib/mail/labels.ts, in the same order, which
/// is the order the picker shows them in.
export const LABEL_ICONS: Array<{ id: string; name: string; Icon: LucideIcon }> = [
  { id: "tag", name: "Tag", Icon: Tag },
  { id: "briefcase", name: "Work", Icon: Briefcase },
  { id: "graduation-cap", name: "School", Icon: GraduationCap },
  { id: "users", name: "People", Icon: Users },
  { id: "dollar-sign", name: "Money", Icon: DollarSign },
  { id: "receipt", name: "Receipts", Icon: Receipt },
  { id: "calendar", name: "Events", Icon: Calendar },
  { id: "megaphone", name: "Announcements", Icon: Megaphone },
  { id: "heart", name: "Personal", Icon: Heart },
  { id: "star", name: "Important", Icon: Star },
  { id: "flag", name: "Follow up", Icon: Flag },
  { id: "bookmark", name: "Saved", Icon: Bookmark },
  { id: "trophy", name: "Awards", Icon: Trophy },
  { id: "code", name: "Tech", Icon: Code },
  { id: "home", name: "Home", Icon: House },
  { id: "plane", name: "Travel", Icon: Plane },
  { id: "book", name: "Reading", Icon: BookOpen },
  { id: "handshake", name: "Recruiting", Icon: Handshake },
  { id: "bell", name: "Alerts", Icon: Bell },
  { id: "zap", name: "Urgent", Icon: Zap },
];

export function labelIcon(id: string | undefined): LucideIcon {
  return LABEL_ICONS.find((i) => i.id === id)?.Icon ?? Tag;
}
