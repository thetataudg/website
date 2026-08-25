import { AllEventsList } from "../../AllEventsList";

export const dynamic = "force-dynamic";

export default function AllMyEventsPage() {
  return <AllEventsList scope="mine" />;
}
