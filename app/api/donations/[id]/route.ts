// app/api/donations/[id]/route.ts
// Marking a gift as thanked.
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/db";
import Donation from "@/lib/models/Donation";
import { requireTreasury } from "@/lib/duesAuth";
import { serializeDonation } from "@/lib/donations";
import { sendDonationThankYou } from "@/lib/donationReceipt";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let viewer;
  try {
    viewer = await requireTreasury(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 403 });
  }
  if (!mongoose.Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Invalid donation id" }, { status: 400 });
  }

  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const donation = await Donation.findById(params.id);
    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }

    // Sending is the one action here that leaves the building, so it happens
    // before anything is marked: a failed send must not leave a gift recorded
    // as thanked.
    if (body?.sendThankYou === true) {
      const result = await sendDonationThankYou(donation, { force: true });
      if (!result.sent) {
        return NextResponse.json(
          {
            error:
              result.skipped === "no email address"
                ? "This donor did not leave an email address. Mark it thanked once you have reached them another way."
                : `Couldn't send that thank-you (${result.skipped}).`,
          },
          { status: 409 }
        );
      }
      donation.acknowledgedAt = new Date();
      donation.acknowledgedBy = viewer._id;
      await donation.save();
      const fresh = await Donation.findById(params.id).lean<any>();
      return NextResponse.json({ donation: serializeDonation(fresh), sent: true });
    }

    // Acknowledgement is a claim that a human said thank you, so it records who
    // said it. Un-acknowledging exists because the honest answer to "did anyone
    // actually thank them" is sometimes no.
    if (body?.acknowledged === false) {
      donation.acknowledgedAt = null;
      donation.acknowledgedBy = null;
    } else {
      donation.acknowledgedAt = donation.acknowledgedAt ?? new Date();
      donation.acknowledgedBy = viewer._id;
    }
    await donation.save();

    return NextResponse.json({ donation: serializeDonation(donation) });
  } catch (err: any) {
    logger.error({ err, donationId: params.id }, "Failed to update a donation");
    return NextResponse.json({ error: "Couldn't update that gift" }, { status: 500 });
  }
}
