// lib/notify/links.ts
// Making a notification's link point at the one thing it is about.
//
// Templates name a screen ("/member/dues"); the send knows which charge, plan,
// claim or payment report moved, because every money-moving route passes it in
// `refs`. This joins the two, once, in the pipeline, so the push, the bell row
// and the email button all carry the same specific link and no template has to
// remember to build it.
//
// The ids ride as query parameters on the screen's own path. The website pages
// ignore parameters they don't read, so a link opened in a browser still lands
// on the right page; the app reads them to open the exact row.

/// The paths whose screens can single out one item. Anything else (an event,
/// a poll, a mailbox message) already carries its id in the path.
const LEDGER_PATHS = new Set(["/member/dues", "/member/admin/dues", "/member/admin/dues/requests"]);

/// `refs` key to query parameter. Order is priority: when a send names both a
/// report and the charge it pays, the report is the more specific thing.
const REF_PARAMS: Array<[string, string]> = [
  ["submissionId", "submission"],
  ["reimbursementId", "reimbursement"],
  ["planId", "plan"],
  ["chargeId", "charge"],
];

/// Appends params to a site-relative link, leaving any already there alone.
export function withQuery(link: string, params: Record<string, string | null | undefined>): string {
  const [path, existing = ""] = link.split("?");
  const query = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) {
    if (value && !query.has(key)) query.set(key, value);
  }
  const rendered = query.toString();
  return rendered ? `${path}?${rendered}` : path;
}

/// The link, narrowed to the item `refs` names when its screen supports that.
export function specificLink(link: string, refs: Record<string, any> | undefined): string {
  if (!link || !refs) return link;
  const path = link.split("?")[0];
  if (!LEDGER_PATHS.has(path)) return link;

  const params: Record<string, string> = {};
  for (const [ref, param] of REF_PARAMS) {
    const value = refs[ref];
    if (value) params[param] = String(value);
  }
  return withQuery(link, params);
}
