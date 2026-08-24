"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-solid-svg-icons";

type Notification = {
  _id: string;
  template: string;
  title: string;
  body: string;
  link: string;
  category: string;
  amountCents: number | null;
  readAt: string | null;
  createdAt: string | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/// The in-app channel, on the website.
///
/// Polled rather than pushed: the whole notification volume here is a handful
/// of dues notices a term, and a websocket for that would be more moving parts
/// than the feature is worth. Opening the panel marks everything read, because
/// a badge that survives you reading the thing is just noise.
export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const payload = await res.json();
      setItems(payload.notifications ?? []);
      setUnread(payload.unreadCount ?? 0);
    } catch {
      // A bell that can't load is not worth an error state in the navbar.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 120_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        load();
      } catch {
        /* the panel is open either way */
      }
    }
  }

  return (
    <div className="position-relative" ref={panelRef}>
      <button
        type="button"
        className="btn btn-outline-light btn-sm position-relative"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <FontAwesomeIcon icon={faBell} />
        {unread > 0 && (
          <span
            className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
            style={{ fontSize: 10 }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="position-absolute end-0 mt-2 shadow rounded border bg-body"
          style={{ width: 340, maxHeight: 420, overflowY: "auto", zIndex: 1050 }}
        >
          <div className="px-3 py-2 border-bottom small text-uppercase text-muted fw-semibold">
            Notifications
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-muted small">
              Nothing yet.
            </div>
          ) : (
            <ul className="list-unstyled mb-0">
              {items.map((item) => (
                <li key={item._id} className="border-bottom">
                  <Link
                    href={item.link || "/member/dues"}
                    className="d-block px-3 py-2 text-decoration-none text-body"
                    onClick={() => setOpen(false)}
                  >
                    <div className="d-flex justify-content-between gap-2">
                      <span className="fw-semibold small">{item.title}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    <div className="small text-muted">{item.body}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
