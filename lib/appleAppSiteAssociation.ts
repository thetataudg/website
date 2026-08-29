const APPLE_APP_ID = "WVQ9Z7S7RR.org.thetatau.dg.ThetaTau";

/** The App Store's numeric id for the iOS app. Public, and it never changes. */
export const APP_STORE_APP_ID = "6804753097";

export const APP_STORE_URL =
  `https://apps.apple.com/us/app/theta-tau-delta-gamma/id${APP_STORE_APP_ID}`;

export function buildAppleAppSiteAssociation() {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [APPLE_APP_ID],
          paths: ["*"],
        },
      ],
    },
  };
}
