// lib/notify/channels/inapp.ts
// The channel with no vendor, no domain and no provisioning — and therefore the
// one everything else is built around. It cannot be misconfigured, so a member
// can always open the app and find out what they were told.
import Notification from "@/lib/models/Notification";
import type { Channel, DeliveryRequest, DeliveryResult } from "./types";

export const inAppChannel: Channel = {
  name: "inapp",

  isConfigured() {
    return true;
  },

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    const created = await Notification.create({
      memberId: request.recipient.memberId,
      template: request.template,
      title: request.message.title,
      body: request.message.body,
      link: request.message.link,
      category: request.message.category,
      amountCents: request.amountCents,
      channels: [],
      refs: {
        chargeId: request.refs.chargeId ?? null,
        planId: request.refs.planId ?? null,
        reimbursementId: request.refs.reimbursementId ?? null,
        submissionId: request.refs.submissionId ?? null,
      },
      sentBy: request.sentBy ?? null,
    });
    return { channel: "inapp", delivered: true, id: created._id };
  },
};
