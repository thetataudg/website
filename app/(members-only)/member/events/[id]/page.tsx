import EventPageClient from "./EventPageClient";

export const dynamic = "force-dynamic";

/**
 * One event, at a stable address.
 *
 * This exists because a shared event needs somewhere to land. The calendar
 * workspace is a month view with dialogs on top of it, and there is no way to
 * say "open this one" in a URL — so a link out of the iOS share sheet, or out
 * of a push notification, had nowhere to point. This is that somewhere.
 */
export default function EventPage({ params }: { params: { id: string } }) {
  return <EventPageClient eventId={params.id} />;
}
