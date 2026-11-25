# Committee budgets: plan

Status: planned, nothing built. Web + iOS. Builds on the existing treasury
(dues, `Reimbursement`, `CreditEntry`, `FinanceEvent`, `lib/notify`).

## What was decided

| Question | Answer |
|---|---|
| Payout | Manual (cash, Venmo, Zelle, check, other) **or** dues credit. No Stripe. |
| Budget period | Per semester (same `term` string as dues), treasurer decides rollover at close |
| Approver | Treasurer only |
| Over budget | Can be submitted with a warning; approval needs an explicit, logged override |
| Who submits | Committee heads only (for committee money). General reimbursements stay as they are today |
| Who sees a budget | That committee's head, plus treasury (E-Council + admins) |
| Budget structure | Line items, income, pre-approval requests, direct chapter spend |
| "Move" | Transfer between committees, reallocate between lines, re-tag an expense, adjust a total |
| Partial approval | Yes, with a required note. Can also **send back** for the head to fix and resubmit |
| Audit log | Treasury sees everything; a head sees their own committee's log |
| Notifications | In-app + push + email, through the existing `lib/notify` |
| Chapter approval | In-app Yes/No vote by default, or the treasurer records an offline vote (date + count) |
| Vote scope | The whole budget as one package; the treasurer can also put a single committee to its own vote |
| Dues | App suggests an even split, the treasurer edits it, then assigns |
| Proposal pushback | Treasurer can send it back to the head or edit it directly; every version is kept |

## The semester cycle

```
1. Proposals     Treasurer opens the term. Each head submits a proposal: line items,
                 amounts, a short reason per line, expected income.
2. Review        Treasurer sends proposals back with a note, or edits them directly.
                 Adds chapter-level costs (nationals, insurance, house, reserve...).
3. Chapter vote  The full package goes to one vote: in the app (existing Vote system,
                 new "Budget" type, Yes/No) or recorded by the treasurer after an
                 offline vote. The treasurer can pull one committee out for its own vote.
4. Dues          From the approved package: total - expected income - carryover,
                 divided by active members, rounded up to the dollar. Treasurer edits
                 the number, then assigns it to all actives through the existing
                 POST /api/dues (allActive).
5. Live budgets  Approved proposals become each committee's budget. Heads submit
                 pre-approvals and claims; the treasurer reviews (sections below).
6. Amendments    Mid-term changes (more money, transfers). The treasurer decides whether
                 an amendment needs a chapter vote; either way it is logged.
7. Close         Rollover per committee, export for the audit.
```

Every step writes to the action log, and every version of a proposal stays viewable,
including what the treasurer changed and why.

### `BudgetProposal` (new): one per committee per term, plus one chapter-level

```
term, committeeId (null = chapter-level costs, owned by the treasurer)
status: "draft" | "submitted" | "returned" | "in_review" | "approved" | "rejected"
version            increments on every submit or treasurer edit
lines: [{ name, amountCents, reason }]
expectedIncomeCents, note
history: [{ version, lines, expectedIncomeCents, editedBy, editedAt, note }]
```

Writing a new version and appending the old one to `history` happens in one document
update, so there is no dual write.

### `BudgetPackage` (new): the thing the chapter votes on

```
term, status: "draft" | "voting" | "approved" | "rejected"
proposalIds + the version of each that was voted on (frozen at vote time)
totalCents, expectedIncomeCents, carryoverCents, activeCount
suggestedDuesCents, finalDuesCents, duesAssignedAt
approval: { method: "app" | "recorded", voteId?, yes, no, abstain, date, recordedBy, note }
```

Approval turns each approved proposal into a `CommitteeBudget` with one `allocation` entry
per line, which is how the live budget gets its starting money. A rejected package goes back
to review; nothing is created.

A single committee voted on its own (`BudgetPackage` with one proposal) uses the same shape,
so mid-term votes for one committee reuse it too.

## Ground rules carried over from the treasury

These are already settled in the dues work and apply here unchanged.

1. **No transactions** (standalone mongod). Every money movement is **one document write**.
   A transfer is one row with a `from` and a `to`, never two rows.
2. **Balances are derived, never stored.** Nothing on a budget holds "spent" or "remaining".
3. **Append-only history.** Mistakes are fixed with a reversing entry, not an edit.
4. **Audit is best-effort after the write.** Write the change, then the log row; on failure log
   `AUDIT GAP:` at error level with enough to rebuild it, and the nightly reconcile backfills it.
5. **Cents everywhere**, integers only.
6. No em dashes in user-facing copy (notifications, emails, summaries).

## Data model

### `CommitteeBudget` (new): one per committee per term

```
committeeId, term                    unique together
status: "open" | "closed"
lines: [{ _id, name, archived }]     names only; money lives in entries
closedAt, closedBy
```

There is always an implicit **Unassigned** line (`lineId: null`) so money can exist before it
is split up, and so archiving a line never strands money.

### `BudgetEntry` (new): every movement that is not a reimbursement

Append-only, signed, one write per movement.

| `kind` | Effect |
|---|---|
| `allocation` | Starting amount for the term (into a line or Unassigned) |
| `adjustment` | Treasurer raises or lowers the total mid-term (signed) |
| `transfer` | `from {budgetId, lineId}` to `to {budgetId, lineId}`. Covers both committee-to-committee and line-to-line |
| `income` | Fundraiser or other money the committee brought in |
| `direct_spend` | Chapter card or check purchase logged by the treasurer, with optional receipt |
| `rollover_in` / `rollover_out` | Written at term close; `rollover_out` on the old budget, `rollover_in` on the new, as **one** `transfer`-shaped row |
| `reversal` | Cancels a prior entry by id. The original is never edited |

Fields: `kind, budgetId, lineId, from?, to?, amountCents, note, receiptUrls[], actorId,
occurredAt, reversesEntryId?`.

### `Reimbursement` (extended): one record for both requests and claims

New fields, all optional so existing general reimbursements are untouched:

```
committeeId, budgetId, lineId
kind: "claim" | "preapproval"
requestedCents          (= today's amountCents)
approvedCents           set on approval; may be lower than requested
overBudgetOverride      bool, set only when approval took the budget past zero
preapprovalId           a claim filed against an approved pre-approval
payout: { status: "unpaid" | "paid", method: "credit"|"cash"|"venmo"|"zelle"|"check"|"other",
          reference, proofUrl, paidAt, paidBy, creditEntryId }
```

Status machine:

```
claim:        pending -> approved -> (payout) paid
                      -> returned -> (head edits) pending
                      -> denied
              pending -> withdrawn         (by the head, before review)

preapproval:  pending -> approved (holds money) -> fulfilled   (claim filed and approved)
                                                -> released    (head or treasurer frees the hold)
                      -> returned / denied / withdrawn
```

Denial, return and partial approval all require a note, shown to the head.

### Derived numbers (`lib/budgets.ts`)

For one budget, per line and in total:

```
funded    = allocations + adjustments + income + transfers in + rollover in
            - transfers out - rollover out            (reversals netted out)
spent     = approved claims (approvedCents) + direct spend
held      = approved pre-approvals not yet fulfilled or released
            (minus the approved amount of any claim already filed against them)
pending   = pending claims + pending pre-approvals    (shown, not subtracted)
available = funded - spent - held
```

Over-budget means a claim's amount exceeds `available` on its line **and** in the committee
total. Line-level overspend inside a committee that still has money gets a softer warning;
the override flag is only for the committee going negative. (Flagged below as an assumption.)

### `BudgetEvent` (new): the action log

Committee-scoped twin of `FinanceEvent`, because `FinanceEvent.memberId` is required and most of
these actions belong to a committee, not a person.

```
committeeId, budgetId, actorId (null = system), type, occurredAt,
amountCents, summary (rendered once, never recomputed),
before, after              snapshot of the fields that changed
refs { reimbursementId, entryId, lineId, otherCommitteeId }
```

Indexed `{committeeId, occurredAt:-1}` and `{occurredAt:-1}`.

Anything that touches a member's money (approval that mints credit, payout) **also** writes the
existing `FinanceEvent`, so the member's own timeline stays complete.

## Every action that gets logged

Cycle: `term_opened`, `proposal_submitted`, `proposal_returned`, `proposal_edited` (with a
diff of the lines), `proposal_resubmitted`, `chapter_costs_set`, `package_created`,
`vote_opened`, `vote_closed`, `vote_recorded`, `package_approved`, `package_rejected`,
`dues_suggested`, `dues_amount_set`, `dues_assigned`, `amendment_proposed`,
`amendment_approved`.

Treasurer: `budget_created`, `budget_allocated`, `budget_adjusted`, `line_added`,
`line_renamed`, `line_archived`, `lines_reallocated`, `transfer_out` / `transfer_in` (one entry,
logged on both committees), `income_recorded`, `direct_spend_recorded`, `entry_reversed`,
`claim_approved`, `claim_partially_approved`, `claim_denied`, `claim_returned`,
`over_budget_override`, `expense_retagged` (before/after committee and line),
`payout_recorded`, `payout_as_credit`, `preapproval_approved`, `preapproval_denied`,
`preapproval_released`, `budget_closed`, `rollover_carried`, `rollover_returned`.

Head: `claim_submitted`, `claim_edited`, `claim_resubmitted`, `claim_withdrawn`,
`preapproval_requested`, `preapproval_released`, `receipt_added`.

System: `threshold_crossed` (80% and 100%), `preapproval_expired` (if we add expiry),
`audit_gap_repaired`.

Not logged: page views and reads. Refused attempts (a non-head trying to submit, an approval
without an override) are logged to pino at warn level, not to `BudgetEvent`.

## Permissions

| Action | Who |
|---|---|
| See a committee's budget, requests, log | Current head of that committee, treasury |
| Submit / edit / withdraw a claim or pre-approval | Current head of that committee |
| Everything else (set, move, approve, pay, close, re-tag, reverse) | Treasury |

"Current head" is read from `Committee.committeeHeadId` at request time. When the head changes
mid-term, the new head inherits the committee's requests and log; the old head loses access.
Each request keeps its original `submittedBy`, so payout still goes to whoever paid.

## API

```
GET    /api/budgets?term=                     treasury: all committees, totals + flags
GET    /api/budgets/[committeeId]?term=       head or treasury: budget, lines, derived numbers
POST   /api/budgets                           create budget for committee + term
PATCH  /api/budgets/[budgetId]                lines (add, rename, archive), close
POST   /api/budgets/[budgetId]/entries        allocation, adjustment, transfer, income, direct_spend
POST   /api/budgets/entries/[id]/reverse
POST   /api/budgets/[budgetId]/close          rollover decisions per committee, one call
GET    /api/budgets/[committeeId]/events      the log, paginated

POST   /api/reimbursements                    gains committeeId, lineId, kind
PATCH  /api/reimbursements/[id]               approve (approvedCents, override, note), deny,
                                              return, withdraw, edit, resubmit, retag, release
POST   /api/reimbursements/[id]/payout        method + reference + proof, or "credit"
GET    /api/budgets/export?term=              CSV + PDF of entries and events (jspdf already a dep)
```

All money routes take `amountCents`, reuse `readAmountCents`, and refuse writes on a closed
budget.

## Screens

### Web
- **Head: `/member/committees/[slug]/budget`.** Big available number, a bar per line
  (spent / held / available), recent activity, "Request money" (pre-approval) and "Submit
  receipt" (claim). My requests list with status, approved amount and payout state. Their
  committee's log.
- **Treasurer: `/member/admin/budgets`.** All committees for a term in one table: funded,
  spent, held, pending, available, % used. Row actions: allocate, adjust, transfer, record
  income, record spend. Term picker and a "Close term" flow that walks each committee's
  leftover with carry / return.
- **Treasurer queue.** New "Committee" tab in `/member/admin/dues/requests` next to the
  existing Reimbursements tab: pending claims and pre-approvals, the line's remaining money
  shown inline, approve full / approve partial / send back / deny, override checkbox only when
  needed. Approved and unpaid list with "Record payout" or "Apply as dues credit".
- **Full log** per committee and chapter-wide, with export.

### iOS
Same three surfaces, built on the existing treasury views: a Budget section on the committee
screen for heads, a Budgets screen for treasury, and the committee tab in `DuesRequestsView`.
Receipts use the existing `PhotoUploadService.uploadReceipt`. Models decode leniently
(`decodeIfPresent`) like the rest of the treasury models.

## Notifications

| Event | To | Channels |
|---|---|---|
| Claim or pre-approval submitted | Treasurer | in-app, push, email |
| Approved (full or partial), denied, sent back | Head | in-app, push, email |
| Payout recorded / applied as credit | Head (submitter) | in-app, push, email |
| Budget set, adjusted, money moved in or out | Head | in-app |
| 80% and 100% of committee budget used | Head + treasurer | in-app, push, email; once per threshold per term |
| Term closed, rollover decision | Head | in-app, email |

Transactional notices bypass the reminder cooldown, like `payment_verified` does today.

## Build order

1. **Models + math.** `BudgetProposal`, `BudgetPackage`, `CommitteeBudget`, `BudgetEntry`,
   `BudgetEvent`, `Reimbursement` fields, `lib/budgets.ts`. Table-driven checks in a
   `check:budgets` script (dues suggestion and rounding, transfers, reversals, partial
   approvals, held money, over-budget detection, rollover).
2. **Proposals.** Head proposal form, treasurer review (send back or edit, with version
   history), chapter-level costs.
3. **Package + vote + dues.** Build the package, open an in-app Budget vote or record an
   offline one, approval creates the live budgets, dues suggestion, edit, assign.
4. **Treasurer budget tools.** Allocate, adjust, transfer, income, direct spend, reverse,
   amendments. Web treasurer page. Log every action.
5. **Head view + submission.** Budget page, claims and pre-approvals, edit, withdraw.
6. **Review.** Approve full or partial, override, send back, deny, re-tag. Queue tab.
7. **Payout.** Manual methods and dues credit (reusing `CreditEntry` and
   `applyCreditToOpenCharges`, so the "never owe and hold credit at once" invariant still holds).
8. **Notifications** and thresholds.
9. **Term close + rollover**, export.
10. **iOS** for all of the above, built with `xcodebuild` and checked for zero warnings, installed
   on the physical iPhone.
11. Nightly reconcile in the in-process ticker: repair `AUDIT GAP`s and check the credit invariant.

## Assumptions to confirm

- **Who counts as "treasurer"?** The dues rule today is any E-Council member or admin
  (`requireTreasury`). Keeping that here is consistent; narrowing to the Treasurer office plus
  admins (`requireTerminalOperator` style) is stricter. Plan assumes the existing broad rule.
- **Line overspend vs committee overspend.** Plan assumes the override is only required when
  the whole committee goes negative, and a single line going negative is just a warning.
- **Pre-approved claims** still go through the treasurer, but are marked "pre-approved" and
  need no override up to the approved amount.
- **Pre-approvals don't expire** on their own; unused holds are released when the term closes.
- **Dues are not recalculated** when the budget is amended mid-term. An amendment that needs
  more money comes out of the reserve or carryover; changing dues means assigning a new charge.
- **Who votes** on a Budget vote is the existing voter list for chapter votes (actives).
- **Proposal window**: the treasurer opens and closes it by hand; no automatic deadline yet.
- **Existing reimbursements** with no committee keep their current behavior (approval mints
  dues credit immediately). Only committee claims get the new payout step.
