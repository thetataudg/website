// /member/tech/TTDG-7K2M: one task as a full page, for links.
import { TaskDetail } from "../components/TaskDetail";

export default function TaskPage({ params }: { params: { key: string } }) {
  return <TaskDetail taskKey={decodeURIComponent(params.key)} />;
}
