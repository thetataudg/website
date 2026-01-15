// app/(members-only)/member/committees/CommitteesClient.tsx
"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faList,
  faTableCellsLarge,
  faUsers,
  faCrown,
  faFilePdf,
} from "@fortawesome/free-solid-svg-icons";

interface MemberRef {
  _id?: string;
  fName?: string;
  lName?: string;
  rollNo?: string;
}

interface Committee {
  _id: string;
  name: string;
  description?: string;
  committeeHeadId?: string | MemberRef;
  committeeMembers?: Array<string | MemberRef>;
}

export default function CommitteesClient({
  committees,
}: {
  committees: Committee[];
}) {
  const [view, setView] = useState<"cards" | "list">("cards");
  const [selected, setSelected] = useState<Committee | null>(null);
  const [memberQuery, setMemberQuery] = useState("");

  const sortedCommittees = useMemo(() => {
    return [...committees].sort((a, b) => a.name.localeCompare(b.name));
  }, [committees]);

  const formatMember = (m: string | MemberRef | undefined) => {
    if (!m) return "Unassigned";
    if (typeof m === "string") return m;
    const name = `${m.fName ?? ""} ${m.lName ?? ""}`.trim();
    const roll = m.rollNo ? ` (#${m.rollNo})` : "";
    return name ? `${name}${roll}` : "Unassigned";
  };

  const listMembers = (members?: Array<string | MemberRef>) =>
    (members || [])
      .map((m) => formatMember(m))
      .filter((label) => label && label !== "Unassigned");

  const exportPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Committee Directory", 40, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 40, 66);

    const tableRows = sortedCommittees.map((committee) => {
      const headLabel = formatMember(committee.committeeHeadId);
      const members = listMembers(committee.committeeMembers);
      return [
        committee.name,
        headLabel,
        members.length ? members.join("\n") : "No members assigned.",
      ];
    });

    autoTable(doc, {
      startY: 90,
      head: [["Committee", "Head", "Members"]],
      body: tableRows,
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: [139, 27, 35], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 244, 238] },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 140 },
        2: { cellWidth: 230 },
      },
    });

    doc.save("committees.pdf");
  };

  const memberMatches = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return [];
    const map = new Map<string, Set<string>>();
    sortedCommittees.forEach((committee) => {
      const head = formatMember(committee.committeeHeadId);
      const members = listMembers(committee.committeeMembers);
      const all = [head, ...members].filter((label) => label && label !== "Unassigned");
      all.forEach((label) => {
        const key = label.toLowerCase();
        if (!key.includes(query)) return;
        if (!map.has(label)) map.set(label, new Set());
        map.get(label)?.add(committee.name);
      });
    });
    return Array.from(map.entries())
      .map(([member, committees]) => ({
        member,
        committees: Array.from(committees).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.member.localeCompare(b.member));
  }, [memberQuery, sortedCommittees]);

  return (
    <div className="member-dashboard committees-page">
      <section className="bento-card committees-hero">
        <div>
          <h2 className="committees-title">Committees</h2>
        </div>
        <div className="committees-controls">
          <div className="btn-group">
            <button
              type="button"
              className={`btn btn-sm ${view === "cards" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setView("cards")}
            >
              <FontAwesomeIcon icon={faTableCellsLarge} className="me-2" />
              Cards
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setView("list")}
            >
              <FontAwesomeIcon icon={faList} className="me-2" />
              List
            </button>
          </div>
          <div className="committee-search">
            <label className="committee-search__label" htmlFor="committee-search">
              Search members
            </label>
            <input
              id="committee-search"
              className="committee-search__input"
              placeholder="Type a member name..."
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
            />
          </div>
          <button className="btn btn-outline-secondary btn-sm" onClick={exportPdf}>
            <FontAwesomeIcon icon={faFilePdf} className="me-2" />
            Export PDF
          </button>
        </div>
      </section>

      {memberQuery.trim() && (
        <section className="committee-search-results bento-card">
          <h3>Member committee matches</h3>
          {memberMatches.length === 0 ? (
            <p className="text-muted">No members match that search.</p>
          ) : (
            <ul>
              {memberMatches.map((match) => (
                <li key={match.member}>
                  <span className="committee-search-results__name">{match.member}</span>
                  <span className="committee-search-results__committees">
                    {match.committees.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "cards" ? (
        <section className="committees-grid">
          {sortedCommittees.map((committee) => {
            const headLabel = formatMember(committee.committeeHeadId);
            const members = listMembers(committee.committeeMembers);
            return (
              <button
                key={committee._id}
                type="button"
                className="committee-card"
                onClick={() => setSelected(committee)}
              >
                <div className="committee-card__header">
                  <h3>{committee.name}</h3>
                  <span className="committee-pill">
                    <FontAwesomeIcon icon={faUsers} className="me-2" />
                    {members.length} members
                  </span>
                </div>
                {committee.description && (
                  <p className="committee-card__desc">{committee.description}</p>
                )}
                <div className="committee-card__head">
                  <FontAwesomeIcon icon={faCrown} className="me-2" />
                  {headLabel}
                </div>
                <p className="committee-card__cta">Click to see the member list</p>
              </button>
            );
          })}
          {sortedCommittees.length === 0 && (
            <div className="bento-card text-center text-muted">
              No committees available.
            </div>
          )}
        </section>
      ) : (
        <section className="bento-card committees-list-view">
          {sortedCommittees.map((committee) => {
            const headLabel = formatMember(committee.committeeHeadId);
            const members = listMembers(committee.committeeMembers);
            return (
              <div key={committee._id} className="committee-list-item">
                <div className="committee-list-item__header">
                  <h3>{committee.name}</h3>
                  <span className="committee-pill">
                    <FontAwesomeIcon icon={faCrown} className="me-2" />
                    {headLabel}
                  </span>
                </div>
                {committee.description && (
                  <p className="text-muted mb-3">{committee.description}</p>
                )}
                <div className="committee-members">
                  <span className="committee-members__label">Members</span>
                  {members.length === 0 ? (
                    <span className="text-muted">No members assigned.</span>
                  ) : (
                    <ul className="committee-members__list">
                      {members.map((m) => (
                        <li key={`${committee._id}-${m}`}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="committee-print">
        <h1>Committee Directory</h1>
        {sortedCommittees.map((committee) => {
          const headLabel = formatMember(committee.committeeHeadId);
          const members = listMembers(committee.committeeMembers);
          return (
            <div key={`${committee._id}-print`} className="committee-print__block">
              <h2>{committee.name}</h2>
              <p className="committee-print__head">Head: {headLabel}</p>
              {committee.description && (
                <p className="committee-print__desc">{committee.description}</p>
              )}
              <div className="committee-print__members">
                {members.length ? (
                  <ul>
                    {members.map((m) => (
                      <li key={`${committee._id}-print-${m}`}>{m}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No members assigned.</p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {selected && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered committee-members-modal">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {selected.name} Members
                  <span className="committee-members-subtitle">
                    {listMembers(selected.committeeMembers).length || 0} members
                  </span>
                </h5>
                <button className="btn-close" onClick={() => setSelected(null)} />
              </div>
              <div className="modal-body">
                <div className="committee-members-headline">
                  <span className="committee-members-label">Committee Head</span>
                  <span className="committee-members-name">
                    {formatMember(selected.committeeHeadId)}
                  </span>
                </div>
                <div className="committee-members-list">
                  {listMembers(selected.committeeMembers).length === 0 ? (
                    <div className="committee-members-empty">
                      No members assigned.
                    </div>
                  ) : (
                    listMembers(selected.committeeMembers).map((m) => (
                      <div key={`${selected._id}-${m}`} className="committee-member-chip">
                        {m}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
