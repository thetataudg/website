import dbConnect from "@/lib/dbConnect";
import Member from "@/models/Member";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { clerkId, ...formData } = req.body;

  if (!clerkId) {
    return res.status(400).json({ message: "Missing Clerk ID" });
  }

  await dbConnect();

  try {
    const existingMember = await Member.findOne({ clerkId });
    if (existingMember) {
      return res.status(400).json({ message: "Member already exists" });
    }

    const member = await Member.create({
      clerkId,
      rollNo: formData.rollNumber,
      majors: formData.majors,
      gradYear: formData.graduationYear,
      bigs: [],
      littles: [],
      bio: formData.bio || "",
      committees: formData.committeePositions.split(","),
      familyLine: formData.familyLine,
      pledgeClass: formData.pledgeClass,
      isECouncil: formData.isElected,
      ecouncilPosition: formData.eCouncilPosition,
      resumeUrl: formData.resumeUrl,
      socialLinks: {
        LinkedIn: formData.linkedinLink,
        GitHub: formData.githubLink,
      },
      status: formData.fraternityStatus,
    });

    res.status(201).json(member);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
}