// app/(members-only)/member/loading.tsx
// Shown the instant a member clicks through to another page.
//
// Several pages here (Brothers, Committees, the admin rosters) are server
// components that fetch before they render. Without a loading boundary, Next
// keeps the *old* page on screen until the new one has finished rendering, so
// a click looked like it had done nothing. With one, the route changes at once
// and this fills the space until the page is ready.
import LoadingState from "../components/LoadingState";

export default function MemberLoading() {
  return <LoadingState message="Loading..." />;
}
