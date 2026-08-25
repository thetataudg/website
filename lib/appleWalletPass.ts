import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import logger from "@/lib/logger";
import { maybePresignUrl } from "@/lib/garage";
import { generateWalletPassToken } from "@/lib/checkinCode";
import type { MemberPassProfile } from "@/lib/memberPassProfile";

const execFileAsync = promisify(execFile);

type ResizeOptions = {
  width: number;
  height: number;
  fit?: "cover" | "contain";
};

type WalletCertPaths = {
  p12Path?: string;
  wwdrPath: string;
  signerCertPath?: string;
  signerKeyPath?: string;
  cleanup?: () => Promise<void>;
};

type PassIdentifiers = {
  teamIdentifier: string;
  passTypeIdentifier: string;
  organizationName: string;
};

type AppleWalletPassOptions = {
  identifiers?: PassIdentifiers;
  serialNumber?: string;
  authenticationToken?: string;
  webServiceURL?: string;
  nfcMessage?: string;
  nfcEncryptionPublicKey?: string;
  nfcRequiresAuthentication?: boolean;
  appLaunchURL?: string;
    associatedStoreIdentifiers?: number[];
};

const PASS_MIME_TYPE = "application/vnd.apple.pkpass";
const CRC_TABLE = buildCrc32Table();

export async function createAppleWalletPass(
  member: MemberPassProfile,
  options: AppleWalletPassOptions = {}
) {
  const certPaths = await resolveCertPaths();
  try {
    const identifiers =
      options.identifiers || (await resolvePassIdentifiers(certPaths));
    const token = generateWalletPassToken(member._id.toString());
    const serialNumber =
      options.serialNumber ||
      createHash("sha1").update(member._id.toString()).digest("hex");

    const crestSource = await fs.readFile(
      path.join(process.cwd(), "public", "crest-transparent.png")
    );
    const otSource = await fs.readFile(
      path.join(process.cwd(), "public", "walletpassicon.png")
    );
    const fallbackThumbnailSource = await fs.readFile(
      path.join(process.cwd(), "public", "ot.png")
    );
    const profileSource = await loadProfilePhoto(member.profilePicUrl);

    const icon = await normalizeToPng(crestSource, {
      width: 29,
      height: 29,
      fit: "contain",
    });
    const icon2x = await normalizeToPng(crestSource, {
      width: 58,
      height: 58,
      fit: "contain",
    });
    const icon3x = await normalizeToPng(crestSource, {
      width: 87,
      height: 87,
      fit: "contain",
    });
    const logo = await normalizeToPng(otSource, {
      width: 160,
      height: 50,
      fit: "contain",
    });
    const logo2x = await normalizeToPng(otSource, {
      width: 320,
      height: 100,
      fit: "contain",
    });
    const logo3x = await normalizeToPng(otSource, {
      width: 480,
      height: 150,
      fit: "contain",
    });
    const thumbnails = await createWalletPassThumbnails({
      primarySource: profileSource,
      fallbackSource: fallbackThumbnailSource,
      rollNo: member.rollNo,
    });

    const majorText = formatList(member.majors);
    const minorText = formatList(member.minors);
    const committeeText = formatList(member.committees);
    const positionText = member.ecouncilPosition?.trim() || "Brother";
    const hometownText = member.hometown?.trim() || "Not set";
    const academicText = [majorText || "Not set", minorText ? `Minor: ${minorText}` : ""]
      .filter(Boolean)
      .join(" | ");
    const secondaryFields = [
      {
        key: "rollNo",
        label: "Roll No",
        value: member.rollNo,
      },
      {
        key: "major",
        label: "Major",
        value: majorText || "Not set",
      },
      {
        key: "minor",
        label: "Minor",
        value: minorText || "Not set",
        textAlignment: "PKTextAlignmentRight",
      },
    ];
    const auxiliaryFields = [
      {
        key: "familyLine",
        label: "Family Line",
        value: member.familyLine || "Not set",
      },
      {
        key: "pledgeClass",
        label: "Pledge Class",
        value: member.pledgeClass || "Not set",
        textAlignment: "PKTextAlignmentRight",
      },
    ];
    const headerFields = [
      {
        key: "status",
        label: "Status",
        value: member.status || "Active",
      },
      {
        key: "gradYear",
        label: "Grad",
        value: member.gradYear ? String(member.gradYear) : "Not set",
      },
    ];

    const passJson: Record<string, any> = {
      formatVersion: 1,
      passTypeIdentifier: identifiers.passTypeIdentifier,
      serialNumber,
      teamIdentifier: identifiers.teamIdentifier,
      organizationName: identifiers.organizationName,
      description: "Theta Tau Delta Gamma Member Pass",
      foregroundColor: "rgb(245, 239, 227)",
      labelColor: "rgb(214, 179, 94)",
      backgroundColor: "rgb(28, 22, 16)",
      suppressStripShine: true,
      sharingProhibited: true,
      appLaunchURL: options.appLaunchURL,
      associatedStoreIdentifiers: options.associatedStoreIdentifiers,
      userInfo: {
        memberId: member._id,
        rollNo: member.rollNo,
        passKind: "member-card",
      },
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: token,
          messageEncoding: "iso-8859-1",
          altText: member.rollNo,
        },
      ],
      generic: {
        headerFields,
        primaryFields: [
          {
            key: "memberName",
            label: "Member",
            value: `${member.fName} ${member.lName}`,
          },
        ],
        secondaryFields,
        auxiliaryFields,
        backFields: [
        {
          key: "memberNameBack",
          label: "Member",
          value: `${member.fName} ${member.lName}`,
        },
        {
          key: "rollNoBack",
          label: "Roll Number",
          value: member.rollNo,
        },
        {
          key: "statusBack",
          label: "Status",
          value: member.status || "Active",
        },
        {
          key: "gradYearBack",
          label: "Graduation Year",
          value: member.gradYear ? String(member.gradYear) : "Not set",
        },
        {
          key: "chapterBack",
          label: "Chapter",
          value: "Delta Gamma",
        },
        {
          key: "positionBack",
          label: "Position",
          value: positionText,
        },
        {
          key: "academicsBack",
          label: "Academics",
          value: academicText || "Not set",
        },
        {
          key: "familyLineBack",
          label: "Family Line",
          value: member.familyLine || "Not set",
        },
        {
          key: "pledgeClassBack",
          label: "Pledge Class",
          value: member.pledgeClass || "Not set",
        },
        {
          key: "majorsBack",
          label: "Major(s)",
          value: majorText || "Not set",
        },
        {
          key: "minorsBack",
          label: "Minor(s)",
          value: minorText || "Not set",
        },
        {
          key: "committeesBack",
          label: "Committee(s)",
          value: committeeText || "Not set",
        },
        {
          key: "hometownBack",
          label: "Hometown",
          value: hometownText,
        },
        {
          key: "usage",
          label: "Check-In",
          value:
            "Scan this pass at event check-in to count towards attendance and earn GEM points.",
        },
        ],
      },
    };

    if (options.authenticationToken && options.webServiceURL) {
      passJson.authenticationToken = options.authenticationToken;
      passJson.webServiceURL = options.webServiceURL;
    }

    if (options.nfcMessage && options.nfcEncryptionPublicKey) {
      passJson.nfc = {
        message: options.nfcMessage,
        encryptionPublicKey: options.nfcEncryptionPublicKey,
        requiresAuthentication: Boolean(options.nfcRequiresAuthentication),
      };
      passJson.generic.backFields.push({
        key: "nfcBack",
        label: "NFC",
        value: "NFC payload is provisioned for future proximity-reader support.",
      });
    }

    const files: Record<string, Buffer> = {
      "pass.json": Buffer.from(JSON.stringify(passJson, null, 2)),
      "icon.png": icon,
      "icon@2x.png": icon2x,
      "icon@3x.png": icon3x,
      "logo.png": logo,
      "logo@2x.png": logo2x,
      "logo@3x.png": logo3x,
    };

    if (thumbnails) {
      files["thumbnail.png"] = thumbnails.thumbnail;
      files["thumbnail@2x.png"] = thumbnails.thumbnail2x;
      files["thumbnail@3x.png"] = thumbnails.thumbnail3x;
    }

    const manifest = buildManifest(files);
    files["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2));
    files.signature = await signManifest(files["manifest.json"], certPaths);

    const pkpass = buildZip(files);
    return {
      buffer: pkpass,
      fileName: `theta-tau-member-${member.rollNo}.pkpass`,
      contentType: PASS_MIME_TYPE,
    };
  } finally {
    await certPaths.cleanup?.();
  }
}

export async function getAppleWalletCertDiagnostics() {
  const configuredDir = process.env.APPLE_WALLET_CERTS_DIR?.trim() || null;
  const p12Path = process.env.APPLE_WALLET_CERT_P12_PATH?.trim() || null;
  const wwdrPath = process.env.APPLE_WALLET_WWDR_PATH?.trim() || null;
  const signerCertPath = process.env.APPLE_WALLET_SIGNER_CERT_PATH?.trim() || null;
  const signerKeyPath = process.env.APPLE_WALLET_SIGNER_KEY_PATH?.trim() || null;

  const diagnostics = {
    env: {
      APPLE_WALLET_CERTS_DIR: Boolean(configuredDir),
      APPLE_WALLET_CERT_PASSWORD: Boolean(process.env.APPLE_WALLET_CERT_PASSWORD?.trim()),
      APPLE_WALLET_TEAM_IDENTIFIER: Boolean(process.env.APPLE_WALLET_TEAM_IDENTIFIER?.trim()),
      APPLE_WALLET_PASS_TYPE_IDENTIFIER: Boolean(
        process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER?.trim()
      ),
      APPLE_WALLET_CERT_P12_PATH: Boolean(p12Path),
      APPLE_WALLET_WWDR_PATH: Boolean(wwdrPath),
      APPLE_WALLET_SIGNER_CERT_PATH: Boolean(signerCertPath),
      APPLE_WALLET_SIGNER_KEY_PATH: Boolean(signerKeyPath),
      APPLE_WALLET_CERT_P12_BASE64: Boolean(
        process.env.APPLE_WALLET_CERT_P12_BASE64?.trim()
      ),
      APPLE_WALLET_WWDR_BASE64: Boolean(process.env.APPLE_WALLET_WWDR_BASE64?.trim()),
      APPLE_WALLET_WWDR_PEM: Boolean(process.env.APPLE_WALLET_WWDR_PEM?.trim()),
      APPLE_WALLET_SIGNER_CERT_BASE64: Boolean(
        process.env.APPLE_WALLET_SIGNER_CERT_BASE64?.trim()
      ),
      APPLE_WALLET_SIGNER_CERT_PEM: Boolean(
        process.env.APPLE_WALLET_SIGNER_CERT_PEM?.trim()
      ),
      APPLE_WALLET_SIGNER_KEY_BASE64: Boolean(
        process.env.APPLE_WALLET_SIGNER_KEY_BASE64?.trim()
      ),
      APPLE_WALLET_SIGNER_KEY_PEM: Boolean(
        process.env.APPLE_WALLET_SIGNER_KEY_PEM?.trim()
      ),
    },
    paths: {
      configuredDir,
      p12Path,
      wwdrPath,
      signerCertPath,
      signerKeyPath,
    },
    cwd: process.cwd(),
  };

  const candidateDirs = [
    configuredDir,
    path.join(process.cwd(), "secrets", "apple-wallet"),
    path.join(process.cwd(), "certs", "apple-wallet"),
    path.join(process.cwd(), "app", "certs"),
  ].filter(Boolean) as string[];

  const candidateChecks = await Promise.all(
    candidateDirs.map(async (candidate) => {
      try {
        const entries = await fs.readdir(candidate);
        return { candidate, exists: true, entries };
      } catch {
        return { candidate, exists: false, entries: [] as string[] };
      }
    })
  );

  return {
    ...diagnostics,
    candidateChecks,
  };
}

async function resolveCertPaths(): Promise<WalletCertPaths> {
  const fromEnv = await resolveCertPathsFromEnvironment();
  if (fromEnv) {
    return fromEnv;
  }

  const configuredDir = process.env.APPLE_WALLET_CERTS_DIR;
  const candidates = [
    configuredDir,
    path.join(process.cwd(), "secrets", "apple-wallet"),
    path.join(process.cwd(), "certs", "apple-wallet"),
    path.join(process.cwd(), "app", "certs"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const entries = await fs.readdir(candidate);
      const p12Name = entries.find((entry) => entry.toLowerCase().endsWith(".p12"));
      const wwdrName = entries.find((entry) => {
        const lower = entry.toLowerCase();
        return (
          lower.includes("wwdr") &&
          (lower.endsWith(".cer") || lower.endsWith(".crt") || lower.endsWith(".pem"))
        );
      });
      const signerCertName =
        entries.find((entry) => entry.toLowerCase() === "passcertificate.pem") ||
        entries.find((entry) => entry.toLowerCase().includes("passcertificate"));
      const signerKeyName =
        entries.find((entry) => entry.toLowerCase() === "passkey.pem") ||
        entries.find((entry) => entry.toLowerCase().includes("passkey"));
      if (wwdrName && (p12Name || (signerCertName && signerKeyName))) {
        return {
          p12Path: p12Name ? path.join(candidate, p12Name) : undefined,
          wwdrPath: path.join(candidate, wwdrName),
          signerCertPath: signerCertName
            ? path.join(candidate, signerCertName)
            : undefined,
          signerKeyPath: signerKeyName
            ? path.join(candidate, signerKeyName)
            : undefined,
        };
      }
    } catch {
      // ignore missing directory candidates
    }
  }

  throw new Error(
    "Apple Wallet certificates not found. Set Netlify/runtime secret env vars or put the signing cert/key and WWDR cert in secrets/apple-wallet."
  );
}

async function resolveCertPathsFromEnvironment(): Promise<WalletCertPaths | null> {
  const p12Path = process.env.APPLE_WALLET_CERT_P12_PATH?.trim();
  const wwdrPath = process.env.APPLE_WALLET_WWDR_PATH?.trim();
  const signerCertPath = process.env.APPLE_WALLET_SIGNER_CERT_PATH?.trim();
  const signerKeyPath = process.env.APPLE_WALLET_SIGNER_KEY_PATH?.trim();

  if (wwdrPath && (p12Path || (signerCertPath && signerKeyPath))) {
    return {
      p12Path: p12Path || undefined,
      wwdrPath,
      signerCertPath: signerCertPath || undefined,
      signerKeyPath: signerKeyPath || undefined,
    };
  }

  const p12Base64 = process.env.APPLE_WALLET_CERT_P12_BASE64?.trim();
  const wwdrValue =
    process.env.APPLE_WALLET_WWDR_BASE64?.trim() ||
    process.env.APPLE_WALLET_WWDR_PEM?.trim();
  const signerCertValue =
    process.env.APPLE_WALLET_SIGNER_CERT_BASE64?.trim() ||
    process.env.APPLE_WALLET_SIGNER_CERT_PEM?.trim();
  const signerKeyValue =
    process.env.APPLE_WALLET_SIGNER_KEY_BASE64?.trim() ||
    process.env.APPLE_WALLET_SIGNER_KEY_PEM?.trim();

  if (!wwdrValue || (!p12Base64 && !(signerCertValue && signerKeyValue))) {
    return null;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wallet-certs-"));
  try {
    const resolved: WalletCertPaths = {
      wwdrPath: path.join(tempDir, "wwdr.pem"),
      cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
    };

    await fs.writeFile(resolved.wwdrPath, decodeConfiguredSecret(wwdrValue));

    if (p12Base64) {
      resolved.p12Path = path.join(tempDir, "pass-cert.p12");
      await fs.writeFile(resolved.p12Path, Buffer.from(p12Base64, "base64"));
    } else {
      resolved.signerCertPath = path.join(tempDir, "passCertificate.pem");
      resolved.signerKeyPath = path.join(tempDir, "passKey.pem");
      await fs.writeFile(resolved.signerCertPath, decodeConfiguredSecret(signerCertValue!));
      await fs.writeFile(resolved.signerKeyPath, decodeConfiguredSecret(signerKeyValue!));
    }

    return resolved;
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

function decodeConfiguredSecret(value: string) {
  if (value.includes("-----BEGIN")) {
    return Buffer.from(normalizeMultilineEnv(value), "utf8");
  }
  return Buffer.from(value, "base64");
}

function normalizeMultilineEnv(value: string) {
  return value.replace(/\\n/g, "\n");
}

export async function getAppleWalletPassIdentifiers() {
  const certPaths = await resolveCertPaths();
  try {
    const identifiers = await resolvePassIdentifiers(certPaths);
    return { identifiers };
  } finally {
    await certPaths.cleanup?.();
  }
}

async function resolvePassIdentifiers(certPaths: WalletCertPaths): Promise<PassIdentifiers> {
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_IDENTIFIER;
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER;
  const organizationName =
    process.env.APPLE_WALLET_ORGANIZATION_NAME || "Theta Tau Delta Gamma";

  if (teamIdentifier && passTypeIdentifier) {
    return { teamIdentifier, passTypeIdentifier, organizationName };
  }

  const password = process.env.APPLE_WALLET_CERT_PASSWORD ?? "";
  const subject = await extractSignerSubject(certPaths, password);
  const parsedTeamIdentifier = subject.match(/OU\s*=\s*([^,\/]+)/)?.[1]?.trim();
  const parsedPassTypeIdentifier = subject
    .match(/CN\s*=\s*Pass Type ID:\s*([^,\/]+)/)?.[1]
    ?.trim();

  if (!parsedTeamIdentifier || !parsedPassTypeIdentifier) {
    throw new Error(
      "Unable to derive Apple Wallet identifiers from the signing certificate. Set APPLE_WALLET_TEAM_IDENTIFIER and APPLE_WALLET_PASS_TYPE_IDENTIFIER."
    );
  }

  return {
    teamIdentifier: teamIdentifier || parsedTeamIdentifier,
    passTypeIdentifier: passTypeIdentifier || parsedPassTypeIdentifier,
    organizationName,
  };
}

async function extractSignerSubject(certPaths: WalletCertPaths, password: string) {
  if (certPaths.signerCertPath) {
    const details = await execFileAsync(
      "openssl",
      ["x509", "-noout", "-subject", "-in", certPaths.signerCertPath],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return details.stdout;
  }

  if (!certPaths.p12Path) {
    throw new Error(
      "Apple Wallet signing certificate is incomplete. Provide a passcertificate.pem or Certificates.p12 file."
    );
  }

  const args = [
    "pkcs12",
    "-in",
    certPaths.p12Path,
    "-clcerts",
    "-nokeys",
    "-passin",
    `pass:${password}`,
    "-nodes",
  ];

  const attempts = [
    ["-legacy", ...args],
    args,
  ];

  for (const attempt of attempts) {
    try {
      const { stdout } = await execFileAsync("openssl", attempt, {
        maxBuffer: 10 * 1024 * 1024,
      });
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wallet-cert-"));
      try {
        const certPath = path.join(tempDir, "signer.pem");
        await fs.writeFile(certPath, stdout);
        const details = await execFileAsync(
          "openssl",
          ["x509", "-noout", "-subject", "-in", certPath],
          { maxBuffer: 10 * 1024 * 1024 }
        );
        return details.stdout;
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch {
      // try next extraction mode
    }
  }

  throw new Error(
    "Unable to read the Apple Wallet signing certificate. Check APPLE_WALLET_CERT_PASSWORD."
  );
}

async function loadProfilePhoto(profilePicUrl?: string) {
  if (!profilePicUrl) return null;

  try {
    const presignedUrl = await maybePresignUrl(profilePicUrl, 300);
    if (!presignedUrl) return null;
    const response = await fetch(presignedUrl);
    if (!response.ok) {
      logger.warn(
        { profilePicUrl, status: response.status },
        "Failed to fetch member profile photo for wallet pass"
      );
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    logger.warn({ err }, "Failed to load member profile photo for wallet pass");
    return null;
  }
}

async function createThumbnailSet(source: Buffer) {
  const [thumbnail, thumbnail2x, thumbnail3x] = await Promise.all([
    normalizeToPng(source, {
      width: 90,
      height: 90,
      fit: "cover",
    }),
    normalizeToPng(source, {
      width: 180,
      height: 180,
      fit: "cover",
    }),
    normalizeToPng(source, {
      width: 270,
      height: 270,
      fit: "cover",
    }),
  ]);

  return { thumbnail, thumbnail2x, thumbnail3x };
}

async function createWalletPassThumbnails(input: {
  primarySource: Buffer | null;
  fallbackSource: Buffer;
  rollNo: string;
}) {
  try {
    if (input.primarySource) {
      return await createThumbnailSet(input.primarySource);
    }
  } catch (err: any) {
    logger.warn(
      { err, rollNo: input.rollNo },
      "Skipping wallet pass thumbnail because the member photo could not be converted"
    );
  }

  try {
    return await createThumbnailSet(input.fallbackSource);
  } catch (err: any) {
    logger.error(
      { err, rollNo: input.rollNo },
      "Failed to create fallback wallet pass thumbnail"
    );
    return null;
  }
}

async function normalizeToPng(source: Buffer, options: ResizeOptions) {
  const withSharp = await trySharpTransform(source, options);
  if (withSharp) return withSharp;

  const withCli = await tryCliTransform(source, options);
  if (withCli) return withCli;

  if (isPng(source)) {
    return source;
  }

  throw new Error(
    "Unable to convert wallet pass images to PNG. Install sharp or provide PNG assets."
  );
}

async function trySharpTransform(source: Buffer, options: ResizeOptions) {
  try {
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)"
    ) as (specifier: string) => Promise<any>;
    const sharpModule = await dynamicImport("sharp");
    const sharp = sharpModule.default;
    return await sharp(source)
      .rotate()
      .resize({
        width: options.width,
        height: options.height,
        fit: options.fit || "cover",
        position: "centre",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

async function tryCliTransform(source: Buffer, options: ResizeOptions) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wallet-img-"));
  const inputPath = path.join(tempDir, "input");
  const outputPath = path.join(tempDir, "output.png");

  try {
    await fs.writeFile(inputPath, source);

    try {
      const dimensions = await getSipsDimensions(inputPath);
      if (dimensions) {
        const widthScale = options.width / dimensions.width;
        const heightScale = options.height / dimensions.height;
        const scale =
          options.fit === "contain"
            ? Math.min(widthScale, heightScale)
            : Math.max(widthScale, heightScale);

        const resizedWidth = Math.max(1, Math.round(dimensions.width * scale));
        const resizedHeight = Math.max(1, Math.round(dimensions.height * scale));

        await execFileAsync(
          "sips",
          [
            "-s",
            "format",
            "png",
            "-z",
            String(resizedHeight),
            String(resizedWidth),
            inputPath,
            "--out",
            outputPath,
          ],
          { maxBuffer: 10 * 1024 * 1024 }
        );

        if (options.fit === "contain") {
          await execFileAsync(
            "sips",
            [
              "--padToHeightWidth",
              String(options.height),
              String(options.width),
              "--padColor",
              "00000000",
              outputPath,
              "--out",
              outputPath,
            ],
            { maxBuffer: 10 * 1024 * 1024 }
          );
        } else {
          await execFileAsync(
            "sips",
            [
              "--cropToHeightWidth",
              String(options.height),
              String(options.width),
              outputPath,
              "--out",
              outputPath,
            ],
            { maxBuffer: 10 * 1024 * 1024 }
          );
        }

        return await fs.readFile(outputPath);
      }
    } catch {
      // not on macOS or sips unavailable
    }

    try {
      await execFileAsync(
        "sips",
        [
          "-s",
          "format",
          "png",
          "-z",
          String(options.height),
          String(options.width),
          inputPath,
          "--out",
          outputPath,
        ],
        { maxBuffer: 10 * 1024 * 1024 }
      );
      return await fs.readFile(outputPath);
    } catch {
      // not on macOS or sips unavailable
    }

    const magickArgs = [
      inputPath,
      "-auto-orient",
      "-resize",
      `${options.width}x${options.height}${options.fit === "contain" ? "" : "^"}`,
    ];
    if (options.fit !== "contain") {
      magickArgs.push(
        "-gravity",
        "center",
        "-extent",
        `${options.width}x${options.height}`
      );
    }
    magickArgs.push(`png:${outputPath}`);

    try {
      await execFileAsync("magick", magickArgs, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return await fs.readFile(outputPath);
    } catch {
      // fall through
    }

    try {
      await execFileAsync("convert", magickArgs, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return await fs.readFile(outputPath);
    } catch {
      return null;
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function getSipsDimensions(inputPath: string) {
  try {
    const { stdout } = await execFileAsync(
      "sips",
      ["-g", "pixelWidth", "-g", "pixelHeight", inputPath],
      { maxBuffer: 1024 * 1024 }
    );
    const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
    const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

function isPng(buffer: Buffer) {
  return buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
}

function formatList(values?: string[]) {
  return (values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
}

function buildManifest(files: Record<string, Buffer>) {
  return Object.fromEntries(
    Object.entries(files).map(([name, buffer]) => [
      name,
      createHash("sha1").update(buffer).digest("hex"),
    ])
  );
}

async function signManifest(manifestBuffer: Buffer, certPaths: WalletCertPaths) {
  const password = process.env.APPLE_WALLET_CERT_PASSWORD ?? "";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wallet-sign-"));

  try {
    const manifestPath = path.join(tempDir, "manifest.json");
    const signerCertPath = path.join(tempDir, "signerCert.pem");
    const signerKeyPath = path.join(tempDir, "signerKey.pem");
    const wwdrPemPath = path.join(tempDir, "wwdr.pem");
    const signaturePath = path.join(tempDir, "signature");

    await fs.writeFile(manifestPath, manifestBuffer);
    if (certPaths.signerCertPath && certPaths.signerKeyPath) {
      await fs.copyFile(certPaths.signerCertPath, signerCertPath);
      await fs.copyFile(certPaths.signerKeyPath, signerKeyPath);
    } else {
      if (!certPaths.p12Path) {
        throw new Error("Apple Wallet signing certificate is incomplete.");
      }
      await extractPemFiles(
        certPaths.p12Path,
        password,
        signerCertPath,
        signerKeyPath
      );
    }
    await convertWwdrToPem(certPaths.wwdrPath, wwdrPemPath);

    const signArgs = [
      "smime",
      "-binary",
      "-sign",
      "-certfile",
      wwdrPemPath,
      "-signer",
      signerCertPath,
      "-inkey",
      signerKeyPath,
      "-passin",
      `pass:${password}`,
      "-in",
      manifestPath,
      "-out",
      signaturePath,
      "-outform",
      "DER",
    ];

    await execFileAsync("openssl", signArgs, {
      maxBuffer: 10 * 1024 * 1024,
    });

    return await fs.readFile(signaturePath);
  } catch (err: any) {
    logger.error({ err }, "Failed to sign Apple Wallet pass");
    throw new Error(
      "Unable to sign the Apple Wallet pass. Check the certificate password and cert files."
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function extractPemFiles(
  p12Path: string,
  password: string,
  certOutPath: string,
  keyOutPath: string
) {
  const baseArgs = ["-in", p12Path, "-passin", `pass:${password}`];
  const attempts = [
    ["-legacy", ...baseArgs],
    baseArgs,
  ];

  for (const base of attempts) {
    try {
      await execFileAsync(
        "openssl",
        ["pkcs12", ...base, "-clcerts", "-nokeys", "-out", certOutPath],
        { maxBuffer: 10 * 1024 * 1024 }
      );
      await execFileAsync(
        "openssl",
        ["pkcs12", ...base, "-nocerts", "-nodes", "-out", keyOutPath],
        { maxBuffer: 10 * 1024 * 1024 }
      );
      return;
    } catch {
      // try without legacy support
    }
  }

  throw new Error("Unable to extract the Apple Wallet certificate and key.");
}

async function convertWwdrToPem(inputPath: string, outputPath: string) {
  try {
    await execFileAsync(
      "openssl",
      ["x509", "-inform", "DER", "-in", inputPath, "-out", outputPath],
      { maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    const source = await fs.readFile(inputPath);
    await fs.writeFile(outputPath, source);
  }
}

function buildZip(files: Record<string, Buffer>) {
  const fileEntries = Object.entries(files).map(([name, data]) => ({
    name,
    data,
    nameBuffer: Buffer.from(name, "utf8"),
    crc32: crc32(data),
    offset: 0,
  }));

  const localParts: Buffer[] = [];
  let offset = 0;
  for (const file of fileEntries) {
    file.offset = offset;
    const header = Buffer.alloc(30 + file.nameBuffer.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(file.crc32 >>> 0, 14);
    header.writeUInt32LE(file.data.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(file.nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    file.nameBuffer.copy(header, 30);
    localParts.push(header, file.data);
    offset += header.length + file.data.length;
  }

  const centralParts: Buffer[] = [];
  let centralSize = 0;
  for (const file of fileEntries) {
    const record = Buffer.alloc(46 + file.nameBuffer.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(0, 10);
    record.writeUInt16LE(0, 12);
    record.writeUInt16LE(0, 14);
    record.writeUInt32LE(file.crc32 >>> 0, 16);
    record.writeUInt32LE(file.data.length, 20);
    record.writeUInt32LE(file.data.length, 24);
    record.writeUInt16LE(file.nameBuffer.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(0, 38);
    record.writeUInt32LE(file.offset, 42);
    file.nameBuffer.copy(record, 46);
    centralParts.push(record);
    centralSize += record.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(fileEntries.length, 8);
  end.writeUInt16LE(fileEntries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
