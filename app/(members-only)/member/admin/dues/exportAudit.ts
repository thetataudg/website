// exportAudit.ts
// The term-end report, drawn in the browser.
//
// jspdf and jspdf-autotable are already dependencies, so this costs nothing but
// the code that lays it out. Imported dynamically because neither belongs in
// the roster page's first load — a treasurer presses this once a semester.

export interface AuditRow {
  rollNo: string;
  name: string;
  assignedCents: number;
  paidCents: number;
  balanceCents: number;
  creditCents: number;
  status: string;
}

export interface AuditPayload {
  term: string;
  generatedAt: string;
  rows: AuditRow[];
  totals: {
    assignedCents: number;
    paidCents: number;
    outstandingCents: number;
    creditOwedCents: number;
    memberCount: number;
    settledCount: number;
  };
  timeline: Array<{
    summary: string;
    occurredAt: string | null;
    actor: { name: string } | null;
    type: string;
  }>;
}

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function day(iso: string | null) {
  if (!iso) return "Not set";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

export async function exportAuditPdf(payload: AuditPayload) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const generated = new Date(payload.generatedAt);

  doc.setFontSize(18);
  doc.text(`Chapter Treasury: ${payload.term}`, 40, 52);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    `Generated ${generated.toLocaleString("en-US", { timeZone: "America/Phoenix" })} · Theta Tau, Delta Gamma`,
    40,
    68
  );

  doc.setTextColor(30);
  doc.setFontSize(11);
  const summary = [
    `Assigned: ${money(payload.totals.assignedCents)}`,
    `Collected: ${money(payload.totals.paidCents)}`,
    `Outstanding: ${money(payload.totals.outstandingCents)}`,
    // The chapter's debt to its members is as much a part of the audit as the
    // debt owed to it, and it's the half a spreadsheet usually loses.
    `Owed to members: ${money(payload.totals.creditOwedCents)}`,
    `${payload.totals.settledCount} of ${payload.totals.memberCount} settled`,
  ];
  summary.forEach((line, index) => doc.text(line, 40, 96 + index * 15));

  autoTable(doc, {
    startY: 96 + summary.length * 15 + 12,
    head: [["Roll", "Member", "Assigned", "Paid", "Balance", "Credit", "Status"]],
    body: payload.rows.map((row) => [
      row.rollNo,
      row.name,
      money(row.assignedCents),
      money(row.paidCents),
      row.balanceCents > 0 ? money(row.balanceCents) : money(0),
      row.creditCents > 0 ? money(row.creditCents) : money(0),
      row.status,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [125, 20, 32], textColor: 255 },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    foot: [[
      "",
      "Total",
      money(payload.totals.assignedCents),
      money(payload.totals.paidCents),
      money(payload.totals.outstandingCents),
      money(payload.totals.creditOwedCents),
      "",
    ]],
    footStyles: { fillColor: [240, 236, 234], textColor: 30, fontStyle: "bold" },
  });

  if (payload.timeline.length) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(30);
    doc.text("Ledger: every recorded action", 40, 52);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      "Each line was written when it happened and has never been recomputed.",
      40,
      68
    );

    autoTable(doc, {
      startY: 84,
      head: [["Date", "What happened", "Who"]],
      body: payload.timeline.map((entry) => [
        day(entry.occurredAt),
        entry.summary,
        entry.actor?.name ?? "System",
      ]),
      styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [125, 20, 32], textColor: 255 },
      columnStyles: { 0: { cellWidth: 70 }, 2: { cellWidth: 90 } },
    });
  }

  doc.save(`treasury-${payload.term.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
