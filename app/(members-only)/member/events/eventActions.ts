/**
 * The few event writes more than one screen makes.
 *
 * Kept out of the hooks so the event page, which has no list to reload, and
 * the lists, which do, send the same request the same way.
 */

/** Moves an event to a new status. True when the server accepted it. */
export async function patchEventStatus(
  eventId: string,
  status: string,
  applyToSeries: "single" | "series" = "single"
): Promise<boolean> {
  const response = await fetch(`/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, applyToSeries }),
  });
  return response.ok;
}

/** The full event, with attendees, and what the viewer may do to it. */
export async function fetchEventDetail(eventId: string): Promise<any | null> {
  const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
  return response.ok ? await response.json() : null;
}
