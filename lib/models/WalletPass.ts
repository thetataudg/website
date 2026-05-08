import { Schema, model, models } from "mongoose";

const WalletPassSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "Member", required: true, index: true },
    passTypeIdentifier: { type: String, required: true, index: true },
    serialNumber: { type: String, required: true, unique: true },
    authenticationToken: { type: String, required: true, unique: true },
    nfcMessage: { type: String, required: true, unique: true },
    lastUpdatedTag: {
      type: String,
      required: true,
      default: () => String(Date.now()),
      index: true,
    },
  },
  { timestamps: true }
);

WalletPassSchema.index(
  { memberId: 1, passTypeIdentifier: 1 },
  { unique: true, name: "wallet_pass_member_type_unique" }
);

const WalletPass = models.WalletPass || model("WalletPass", WalletPassSchema);

export default WalletPass;
