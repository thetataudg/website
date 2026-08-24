const APPLE_APP_ID = "WVQ9Z7S7RR.org.thetatau.dg.ThetaTau";

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
