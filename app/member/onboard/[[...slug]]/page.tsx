/* app/member/onboard/[[...slug]]/page.tsx */
import SignUpWorkspace from "@/components/auth/SignUpWorkspace";
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
    // The chapter's own form rather than Clerk's component: it is the same
    // surface as /sign-up and /sign-in, and it carries no third-party footer.
    // On success it lands back here, where `userId` is now set and the
    // invitation form below takes over.
    return <SignUpWorkspace redirectUrl="/member/onboard" />;
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
