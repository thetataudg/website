/* app/member/onboard/[[...slug]]/page.tsx */
import { SignUp } from "@clerk/nextjs";
import { clerkClient as getClerk, auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import OnboardForm from "./OnboardForm";
import { emailToSlug } from "@/utils/email-to-slug";

interface Params {
  slug?: string[];
}

export default async function OnboardPage({ params }: { params: Params }) {
  const slug = params.slug?.[0] ?? "";
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="d-flex justify-content-center mt-5">
        <SignUp routing="path" path="/member/onboard" signInUrl="/sign-in" />
      </div>
    );
  }

  const clerk = await getClerk();
  const user = await clerk.users.getUser(userId);

  // do any of the user’s e-mails match the slug?
  const invitedEmail = user.emailAddresses.find(
    (e) => emailToSlug(e.emailAddress) === slug
  )?.emailAddress;

  if (!invitedEmail) return (
      <div className="d-flex justify-content-center mt-5">
        <h1>401 Unauthorized</h1>
        <p>You are not invited to use this application.</p>
      </div>
  );

  const pending = (await clerk.invitations.getInvitationList()).data.find(
    (i) =>
      i.emailAddress.toLowerCase() === invitedEmail.toLowerCase() &&
      i.status === "pending"
  );
  // if (!pending) return (
  //   <div className="d-flex justify-content-center mt-5">
  //       <h1>401 Unauthorized</h1>
  //       <p>Invitation is not found or already used.</p>
  //   </div>
  // )

  return <OnboardForm invitedEmail={invitedEmail} />;
}
