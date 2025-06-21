// app/(members-only)/member/admin/page.tsx
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/member/admin/members");
}
