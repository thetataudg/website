// Sample minutes for the development database.
//
// Writes four plausible sets of chapter minutes — PDF into the Garage bucket,
// record into Mongo — so the Minutes screen has something real to render while
// it is being worked on. Everything it creates is tagged, and `--undo` removes
// exactly that set and nothing else.
//
//   npm run seed:minutes
//   npm run seed:minutes -- --undo
//
// Refuses to run against anything but the development database. The connection
// string is shared with production by a single word, and sample minutes turning
// up in the chapter's real record is not a mistake worth risking.
import mongoose from "mongoose";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { buildPDF } from "./lib-makepdf.mjs";

const UNDO = process.argv.includes("--undo");

/// Stamped into every seeded record so `--undo` can find them again without
/// guessing from dates.
const MARKER = "[sample]";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node -r dotenv/config … dotenv_config_path=.env");
  process.exit(1);
}

const dbName = (uri.split("/").pop() || "").split("?")[0];
if (dbName !== "development") {
  console.error(`Refusing to run: MONGODB_URI points at "${dbName}", not "development".`);
  process.exit(1);
}

const bucket = process.env.S3_MINUTES_BUCKET;
const endpointRaw = process.env.NEXT_PUBLIC_GARAGE_ENDPOINT;
const endpoint =
  endpointRaw && !endpointRaw.startsWith("http")
    ? `${process.env.GARAGE_USE_SSL === "false" ? "http" : "https"}://${endpointRaw}`
    : endpointRaw;
const signingRegion =
  process.env.GARAGE_SIGNING_REGION ||
  (endpointRaw?.includes("amazonaws.com") ? process.env.NEXT_PUBLIC_GARAGE_REGION : "garage") ||
  "";

const s3 = new S3Client({
  region: signingRegion,
  endpoint,
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY,
    secretAccessKey: process.env.GARAGE_SECRET_KEY,
  },
  forcePathStyle: true,
});

// ---------------------------------------------------------------- content

/// Phoenix, which is what `formatMeetingDateKey` uses and therefore what the
/// slug in every minutes URL is derived from.
const dateKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(date);

const at = (y, m, d, hh, mm) => new Date(Date.UTC(y, m - 1, d, hh + 7, mm));

const MEETINGS = [
  {
    start: at(2026, 8, 20, 19, 0),
    end: at(2026, 8, 20, 20, 35),
    actives: 47,
    quorum: true,
    eventName: "General Chapter Meeting",
    summary:
      "Rush week dates locked for September 8 through 12. Treasurer reported $4,310 collected of $5,850 assessed. Motion to raise the professional development budget by $400 carried 41 to 4, two abstentions.",
    sections: [
      ["Call to Order", "Regent Panchal called the meeting to order at 7:02 PM in Discovery Hall 250. Scribe confirmed 47 actives present against a roster of 61, clearing the two-thirds requirement for quorum."],
      ["Officer Reports", "Vice Regent reported that all four committee chairs have submitted their semester plans. Treasurer reported $4,310 collected against $5,850 assessed, with nine members on approved payment plans and two accounts referred for follow-up. Scribe noted that last meeting's minutes were approved by unanimous consent."],
      ["Rush Week", "The Rush committee presented the September calendar: tabling at Student Services on the 8th and 9th, an information night on the 10th, a service project on the 11th, and interviews on the 12th. Discussion centred on whether the interview block is long enough given last term's turnout. The committee agreed to add a second interview room and report back."],
      ["Old Business", "The proposal to move chapter meetings to Wednesdays was tabled again pending a survey of members with Wednesday labs. Vice Regent will circulate the survey this week."],
      ["New Business", "A motion to raise the professional development budget by $400 for the fall speaker series was moved and seconded. After discussion on whether the increase should come from reserves or from the social line, the motion carried 41 to 4 with two abstentions, drawing from reserves."],
      ["Announcements", "Regional conference registration closes September 30. The Corresponding Secretary will post the form to the chapter site."],
      ["Adjournment", "Motion to adjourn carried by unanimous consent at 8:35 PM."],
    ],
  },
  {
    start: at(2026, 8, 6, 19, 0),
    end: at(2026, 8, 6, 20, 10),
    actives: 44,
    quorum: true,
    eventName: "General Chapter Meeting",
    summary:
      "First meeting of the fall term. Committee chairs confirmed for Rush, Professional, Service and Brotherhood. Dues for the term set at $150, due September 15.",
    sections: [
      ["Call to Order", "Regent Panchal called the meeting to order at 7:00 PM. 44 actives present, quorum met."],
      ["Committee Chairs", "Chairs were confirmed by acclamation for the fall term: Rush, Professional Development, Service, and Brotherhood. Each chair was asked to submit a semester plan before the next meeting."],
      ["Dues", "Treasurer presented the fall assessment. Dues are set at $150 per active, due September 15, with payment plans available on request through the chapter site. Members carrying a balance from the spring term were asked to speak with the Treasurer directly."],
      ["Calendar", "The fall calendar was reviewed in outline: rush week in September, the regional conference in October, initiation in November, and the end-of-term banquet in December. Exact dates will follow from the committees."],
      ["New Business", "A member raised the condition of the storage closet in the engineering building. The Marshal agreed to inventory it and report at the next meeting."],
      ["Adjournment", "Motion to adjourn carried by unanimous consent at 8:10 PM."],
    ],
  },
  {
    start: at(2026, 7, 23, 19, 0),
    end: at(2026, 7, 23, 19, 48),
    actives: 29,
    quorum: false,
    eventName: "Summer Chapter Meeting",
    summary:
      "Summer meeting held without quorum; no binding votes taken. Discussion of fall rush strategy and a review of the chapter's standing with nationals.",
    sections: [
      ["Call to Order", "Vice Regent called the meeting to order at 7:03 PM. 29 actives present against a roster of 61. Quorum was not met, so no binding votes were taken and everything below is recorded as discussion only."],
      ["Standing With Nationals", "The chapter is in good standing. The annual report was filed on time and the per-capita assessment has been paid in full."],
      ["Fall Rush", "Informal discussion of rush strategy for the fall. The room favoured fewer, longer events over the packed schedule used last year, on the grounds that rushees remembered the conversations rather than the count of events. The Rush chair will bring a concrete calendar to the first meeting of the term."],
      ["Facilities", "The engineering building storage closet is still in poor condition. No action taken without quorum."],
      ["Adjournment", "Meeting adjourned at 7:48 PM."],
    ],
  },
  {
    start: at(2026, 4, 30, 19, 0),
    end: at(2026, 4, 30, 21, 5),
    actives: 52,
    quorum: true,
    eventName: "Spring Elections",
    summary:
      "Spring elections held for all six E-Council positions. Regent, Vice Regent, Scribe, Treasurer, Corresponding Secretary and Marshal elected by ballot. Outgoing officers thanked.",
    sections: [
      ["Call to Order", "Outgoing Regent called the meeting to order at 7:00 PM. 52 actives present, the highest attendance of the term, quorum comfortably met."],
      ["Elections", "Elections were held for all six E-Council positions in the order set by the bylaws. Each candidate spoke for up to three minutes, followed by questions from the floor and a closed ballot. The Scribe recorded the ballots and the results were announced after each position was decided. Every position was filled on the first ballot except Marshal, which required a second ballot after an initial tie."],
      ["Transition", "Outgoing officers were asked to meet with their successors before the end of the term to hand over records, credentials and anything outstanding. The Treasurer and the Scribe were reminded that their handover includes access to the chapter site."],
      ["Recognition", "The chapter thanked the outgoing E-Council for their term, with particular recognition of the Treasurer for bringing the ledger back into order after two terms of drift."],
      ["Adjournment", "Motion to adjourn carried by unanimous consent at 9:05 PM."],
    ],
  },
];

function renderPDF(meeting) {
  const opts = { timeZone: "America/Phoenix" };
  const day = meeting.start.toLocaleDateString("en-US", {
    ...opts, weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const from = meeting.start.toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });
  const to = meeting.end.toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });

  const blocks = [
    { style: "title", text: "Theta Tau - Delta Gamma Chapter" },
    { style: "meta", text: meeting.eventName },
    { style: "meta", text: `${day}   |   ${from} - ${to}` },
    {
      style: "meta",
      text: `${meeting.actives} actives present   |   ${meeting.quorum ? "Quorum met" : "Quorum NOT met"}`,
    },
    { style: "meta", text: "SAMPLE DOCUMENT - development data only" },
  ];
  for (const [heading, body] of meeting.sections) {
    blocks.push({ style: "h2", text: heading.toUpperCase() });
    blocks.push({ style: "body", text: body });
  }
  return buildPDF(blocks);
}

// ------------------------------------------------------------------- run

const Minute =
  mongoose.models.Minute ||
  mongoose.model("Minute", new mongoose.Schema({}, { strict: false, collection: "minutes" }));
const Member =
  mongoose.models.Member ||
  mongoose.model("Member", new mongoose.Schema({}, { strict: false, collection: "members" }));

await mongoose.connect(uri);
console.log(`connected to "${dbName}"`);

if (UNDO) {
  const doomed = await Minute.find({ executiveSummary: new RegExp(escapeRegex(MARKER)) }).lean();
  for (const minute of doomed) {
    if (minute.minutesKey && bucket) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: minute.minutesKey }))
        .catch((err) => console.warn("  could not delete object:", err.message));
    }
  }
  const result = await Minute.deleteMany({ executiveSummary: new RegExp(escapeRegex(MARKER)) });
  console.log(`removed ${result.deletedCount} sample minutes`);
  await mongoose.disconnect();
  process.exit(0);
}

const author =
  (await Member.findOne({ role: { $in: ["admin", "superadmin"] } }).lean()) ||
  (await Member.findOne({}).lean());
if (!author) {
  console.error("No members in the database to attribute these to.");
  await mongoose.disconnect();
  process.exit(1);
}
console.log(`attributing to ${author.fName} ${author.lName} (${author.rollNo})`);

for (const meeting of MEETINGS) {
  const slug = dateKey(meeting.start);
  const existing = await Minute.findOne({ meetingDateKey: slug }).lean();
  if (existing) {
    console.log(`  ${slug}  already present, skipping`);
    continue;
  }

  const pdf = renderPDF(meeting);
  const key = `minutes/${slug}/${Date.now()}-chapter-minutes-${slug}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: pdf,
    ContentType: "application/pdf",
    ContentLength: pdf.length,
  }));

  const meetingDate = new Date(meeting.start);
  meetingDate.setHours(0, 0, 0, 0);

  await Minute.create({
    meetingDate,
    startTime: meeting.start,
    endTime: meeting.end,
    activesPresent: meeting.actives,
    quorumRequired: meeting.quorum,
    executiveSummary: `${meeting.summary} ${MARKER}`,
    eventId: null,
    eventName: meeting.eventName,
    minutesUrl: `${endpoint}/${bucket}/${key}`,
    minutesKey: key,
    meetingDateKey: slug,
    createdBy: author._id,
    hidden: false,
  });
  console.log(`  ${slug}  ${(pdf.length / 1024).toFixed(1)} KB  ${meeting.eventName}`);
}

console.log("done. undo with: npm run seed:minutes -- --undo");
await mongoose.disconnect();

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
