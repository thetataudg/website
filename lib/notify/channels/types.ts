// lib/notify/channels/types.ts
import type { AnyTemplate, RenderedMessage } from "@/lib/notify/templates";

export interface Recipient {
  memberId: any;
  firstName: string;
  lastName: string;
  rollNo: string;
  /// Cached from Clerk on the Member row. Absent for anyone who has never
  /// signed in, which is a real state and not an error.
  email?: string | null;
}

export interface DeliveryRequest {
  recipient: Recipient;
  /// A member template, or one of the namespaced officer-feed or broadcast
  /// ones.
  template: AnyTemplate;
  message: RenderedMessage;
  amountCents: number | null;
  refs: Record<string, any>;
  sentBy: any | null;
  /// Breaks through a Focus and stays on the lock screen for an hour.
  ///
  /// Reserved for the handful of things with a deadline the member cannot see
  /// from outside the app. Most notifications here are about money, which can
  /// wait until somebody picks their phone up; a proxy request can only be
  /// decided while the vote is still closed, which may be minutes.
  ///
  /// Apple treats overuse of this as grounds for review, and members treat it
  /// as grounds for turning notifications off, so the bar is high on purpose.
  timeSensitive?: boolean;
}

export interface DeliveryResult {
  channel: string;
  delivered: boolean;
  /// Why not, when it didn't. Recorded rather than thrown: one member with a
  /// bad email address must not cost the other fifty-nine their reminder.
  skipped?: string;
  /// The row the in-app channel wrote, so the pipeline can stamp the delivered
  /// channels onto it without re-querying for the thing it just made.
  id?: any;
}

export interface Channel {
  name: string;
  /// False when the channel isn't set up on this deployment. The pipeline skips
  /// it silently rather than logging sixty failures a night.
  isConfigured(): boolean;
  deliver(request: DeliveryRequest): Promise<DeliveryResult>;
}
