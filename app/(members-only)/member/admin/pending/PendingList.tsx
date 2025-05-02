// app/(members-only)/member/admin/pending/PendingList.tsx
"use client";

import { useState } from "react";

interface PendingRequest {
  _id: string;
  clerkId: string;
  rollNo: string;
  fName: string;
  lName: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
}

interface Props {
  initialRequests: PendingRequest[];
}

export default function PendingList({ initialRequests }: Props) {
  const [requests, setRequests] = useState<PendingRequest[]>(initialRequests);

  async function review(id: string, action: "approve" | "reject") {
    const res = await fetch(`/api/members/pending/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      console.error("Failed to review:", await res.text());
      return;
    }
    setRequests((rs) => rs.filter((r) => r._id !== id));
  }

  return (
    <div>
      <h2>Pending Onboard Requests</h2>
      <ul className="list-group">
        {requests.map((r) => (
          <li className="list-group-item" key={r._id}>
            <strong>#{r.rollNo}</strong> — {r.fName} {r.lName}
            <div className="mt-2">
              <button
                className="btn btn-sm btn-success me-2"
                onClick={() => review(r._id, "approve")}
              >
                Approve
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => review(r._id, "reject")}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
        {requests.length === 0 && (
          <li className="list-group-item text-center text-muted">
            No pending requests.
          </li>
        )}
      </ul>
    </div>
  );
}
