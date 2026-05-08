import { Schema, model, models } from "mongoose";

const WalletPassRegistrationSchema = new Schema(
  {
    deviceLibraryIdentifier: { type: String, required: true, index: true },
    passTypeIdentifier: { type: String, required: true, index: true },
    serialNumber: { type: String, required: true, index: true },
    pushToken: { type: String, required: true },
  },
  { timestamps: true }
);

WalletPassRegistrationSchema.index(
  { deviceLibraryIdentifier: 1, passTypeIdentifier: 1, serialNumber: 1 },
  { unique: true, name: "wallet_pass_registration_unique" }
);

const WalletPassRegistration =
  models.WalletPassRegistration ||
  model("WalletPassRegistration", WalletPassRegistrationSchema);

export default WalletPassRegistration;
