import { redirect } from "next/navigation";

// Committee events moved onto each committee's own dashboard. The chapter-wide
// "Manage Events" and "All Events" screens are unchanged.
export default function CommitteeEventsPage() {
  redirect("/member/committees");
}
