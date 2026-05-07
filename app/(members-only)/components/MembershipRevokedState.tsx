"use client";

export default function MembershipRevokedState() {
  return (
    <div className="member-dashboard">
      <div className="bento-card text-center">
        <h2>Unauthorized</h2>
        <p className="text-muted mb-0">
          Your membership has been suspended or removed and you no longer have acccess to this application.
        </p>
      </div>
    </div>
  );
}