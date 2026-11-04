import { clerkMiddleware } from '@clerk/nextjs/server';

// Clerk session tokens live 60 seconds and the default skew allowance is 5.
// The App Store build of the iOS app (build 25) reuses a cached token with
// only a 10-second margin and never retries a 401, so a phone whose clock
// runs a little behind, or a slow cellular request, sends a token that is
// already past `exp` and the member sees "You don't have access". The same
// happens on the web when a phone locks mid check-in and the tab's background
// refresh is paused, and Clerk can't refresh a POST for us (that was 219
// failed manual check-ins in a week). Clerk doesn't let the 60 seconds be
// raised, so this is the lever we have: tokens up to five minutes past `exp`
// still verify (signature and all), and a revoked session stops working
// within six. For a chapter site that trade is worth it. Revisit once every
// member is on an app build that refreshes and retries on its own.
export default clerkMiddleware({ clockSkewInMs: 5 * 60_000 });

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
