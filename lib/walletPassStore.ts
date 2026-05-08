import { createHash, randomBytes } from "crypto";
import WalletPass from "@/lib/models/WalletPass";
import WalletPassRegistration from "@/lib/models/WalletPassRegistration";

export type WalletPassRecord = {
  memberId: string;
  passTypeIdentifier: string;
  serialNumber: string;
  authenticationToken: string;
  nfcMessage: string;
  lastUpdatedTag: string;
};

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function nowTag() {
  return String(Date.now());
}

export function buildWalletPassSerial(memberId: string) {
  return createHash("sha1").update(memberId).digest("hex");
}

function createAuthenticationToken() {
  return toBase64Url(randomBytes(24));
}

function createNfcMessage() {
  return `ttdg.${toBase64Url(randomBytes(18))}`;
}

function normalizeWalletPass(doc: any): WalletPassRecord {
  return {
    memberId: doc.memberId?.toString?.() || String(doc.memberId),
    passTypeIdentifier: String(doc.passTypeIdentifier),
    serialNumber: String(doc.serialNumber),
    authenticationToken: String(doc.authenticationToken),
    nfcMessage: String(doc.nfcMessage),
    lastUpdatedTag: String(doc.lastUpdatedTag || ""),
  };
}

export async function ensureWalletPassRecord(input: {
  memberId: string;
  passTypeIdentifier: string;
}) {
  const serialNumber = buildWalletPassSerial(input.memberId);
  const existing = await WalletPass.findOne({
    passTypeIdentifier: input.passTypeIdentifier,
    serialNumber,
  }).lean<any>();

  if (existing && !Array.isArray(existing)) {
    if (String(existing.memberId) !== input.memberId) {
      await WalletPass.updateOne(
        { _id: existing._id },
        { $set: { memberId: input.memberId } }
      );
    }
    return normalizeWalletPass(existing);
  }

  const created = await WalletPass.create({
    memberId: input.memberId,
    passTypeIdentifier: input.passTypeIdentifier,
    serialNumber,
    authenticationToken: createAuthenticationToken(),
    nfcMessage: createNfcMessage(),
    lastUpdatedTag: nowTag(),
  });

  return normalizeWalletPass(created.toObject());
}

export async function findWalletPassRecord(input: {
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  const doc = await WalletPass.findOne(input).lean();
  return doc && !Array.isArray(doc) ? normalizeWalletPass(doc) : null;
}

export async function findWalletPassByNfcMessage(message: string) {
  const doc = await WalletPass.findOne({ nfcMessage: message }).lean();
  return doc && !Array.isArray(doc) ? normalizeWalletPass(doc) : null;
}

export async function registerWalletPassDevice(input: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  pushToken: string;
}) {
  const existing = await WalletPassRegistration.findOne({
    deviceLibraryIdentifier: input.deviceLibraryIdentifier,
    passTypeIdentifier: input.passTypeIdentifier,
    serialNumber: input.serialNumber,
  }).lean<any>();

  if (existing && !Array.isArray(existing)) {
    if (existing.pushToken !== input.pushToken) {
      await WalletPassRegistration.updateOne(
        { _id: existing._id },
        { $set: { pushToken: input.pushToken } }
      );
    }
    return { alreadyRegistered: true };
  }

  await WalletPassRegistration.create(input);
  return { alreadyRegistered: false };
}

export async function unregisterWalletPassDevice(input: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
}) {
  const result = await WalletPassRegistration.deleteOne(input);
  return { deleted: result.deletedCount > 0 };
}

export async function listUpdatedWalletPassSerialNumbers(input: {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  passesUpdatedSince?: string | null;
}) {
  const registrations = await WalletPassRegistration.find(
    {
      deviceLibraryIdentifier: input.deviceLibraryIdentifier,
      passTypeIdentifier: input.passTypeIdentifier,
    },
    { serialNumber: 1 }
  ).lean();

  const serialNumbers = registrations
    .map((registration: any) => String(registration.serialNumber || ""))
    .filter(Boolean);

  if (!serialNumbers.length) {
    return {
      serialNumbers: [] as string[],
      lastUpdated: input.passesUpdatedSince || nowTag(),
    };
  }

  const sinceValue = Number(input.passesUpdatedSince || 0);
  const passes = await WalletPass.find(
    {
      passTypeIdentifier: input.passTypeIdentifier,
      serialNumber: { $in: serialNumbers },
    },
    { serialNumber: 1, lastUpdatedTag: 1 }
  ).lean();

  const updatedPasses = passes.filter((pass: any) => {
    const updatedValue = Number(pass.lastUpdatedTag || 0);
    if (!Number.isFinite(sinceValue) || !sinceValue) return true;
    return updatedValue > sinceValue;
  });

  const latestTag =
    updatedPasses.reduce((latest, pass: any) => {
      const current = Number(pass.lastUpdatedTag || 0);
      return current > latest ? current : latest;
    }, sinceValue || 0) || Date.now();

  return {
    serialNumbers: updatedPasses.map((pass: any) => String(pass.serialNumber)),
    lastUpdated: String(latestTag),
  };
}

export async function markWalletPassUpdatedForMember(memberId: string) {
  await WalletPass.updateMany(
    { memberId },
    { $set: { lastUpdatedTag: nowTag() } }
  );
}
