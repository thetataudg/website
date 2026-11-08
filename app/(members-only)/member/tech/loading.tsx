"use client";

// Shown inside the tracker frame while a view's code or data is on its way,
// so switching tabs never leaves a blank page under the header.
import { usePathname } from "next/navigation";

import { BoardSkeleton, RowsSkeleton } from "./components/Skeletons";

export default function TrackerViewLoading() {
  const pathname = usePathname() || "";
  return (
    <div role="status" aria-label="Loading">
      {pathname.endsWith("/board") ? <BoardSkeleton /> : <RowsSkeleton />}
    </div>
  );
}
