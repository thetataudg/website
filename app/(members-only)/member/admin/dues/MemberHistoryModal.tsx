"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import FinanceTimeline from "../../dues/FinanceTimeline";

/// One member's whole financial story, from the roster.
///
/// Deliberately the same component the member sees of their own record. A
/// fuller officer-only version would be a record the member can't check, and a
/// record they can't check is one they can't dispute.
export default function MemberHistoryModal({
  rollNo,
  name,
  onClose,
}: {
  rollNo: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <div
      className="modal d-block"
      role="dialog"
      style={{ background: "rgba(0,0,0,.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title">{name}</h5>
              <div className="small text-muted">#{rollNo}</div>
            </div>
            <button
              type="button"
              className="btn btn-link text-body p-0 ms-auto"
              onClick={onClose}
              aria-label="Close"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <div className="modal-body">
            <FinanceTimeline
              endpoint={`/api/dues/history/${encodeURIComponent(rollNo)}`}
              title="Finance history"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
