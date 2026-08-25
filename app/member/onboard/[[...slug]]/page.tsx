/* app/member/onboard/[[...slug]]/page.tsx */
import { SignUp } from "@clerk/nextjs";
import { clerkClient as getClerk, auth } from "@clerk/nextjs/server";
import OnboardForm from "./OnboardForm";
import { emailToSlug } from "@/utils/email-to-slug";
import { PageContainer } from "../../../(members-only)/components/shell/PageShell";
import { ErrorState } from "../../../(members-only)/components/shell/States";

interface Params {
  slug?: string[];
}

export default async function OnboardPage({ params }: { params: Params }) {
  const slug = params.slug?.[0];
  const { userId } = await auth();

  if (!userId) {
    return (
      <PageContainer className="flex max-w-md justify-center">
        <SignUp routing="path" path="/member/onboard" signInUrl="/sign-in" />
      </PageContainer>
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
      <PageContainer className="max-w-lg">
        <ErrorState
          title="401 Unauthorized"
          description="This invitation does not match the logged-in email."
        />
      </PageContainer>
    );
  }

  const invitedEmail = emailBySlug ?? primaryEmail;

  if (!invitedEmail) {
    return (
      <PageContainer className="max-w-lg">
        <ErrorState
          title="Missing email"
          description="We could not determine an email address for this account."
        />
      </PageContainer>
    );
  }

  return <OnboardForm invitedEmail={invitedEmail} />;
}
