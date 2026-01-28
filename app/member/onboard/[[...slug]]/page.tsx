/* app/member/onboard/[[...slug]]/page.tsx */
import { SignUp } from "@clerk/nextjs";
import { clerkClient as getClerk, auth } from "@clerk/nextjs/server";
import OnboardForm from "./OnboardForm";
import { emailToSlug } from "@/utils/email-to-slug";

interface Params {
  slug?: string[];
}

export default async function OnboardPage({ params }: { params: Params }) {
  const slug = params.slug?.[0];
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="member-dashboard">
        <SignUp routing="path" path="/member/onboard" signInUrl="/sign-in" />
      </div>
    );
  }

  const clerk = await getClerk();
  const user = await clerk.users.getUser(userId);
  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  const emailBySlug = slug
    ? user.emailAddresses.find(
        (e) => emailToSlug(e.emailAddress) === slug
      )?.emailAddress
    : null;

  if (slug && !emailBySlug) {
    return (
      <div className="member-dashboard">
        <div className="bento-card">
          <h1>401 Unauthorized</h1>
          <p>This invitation does not match the logged-in email.</p>
        </div>
      </div>
    );
  }

  const invitedEmail = emailBySlug ?? primaryEmail;

  if (!invitedEmail) {
    return (
      <div className="member-dashboard">
        <div className="bento-card">
          <h1>Missing email</h1>
          <p>We could not determine an email address for this account.</p>
        </div>
      </div>
    );
  }

  return <OnboardForm invitedEmail={invitedEmail} />;
}
