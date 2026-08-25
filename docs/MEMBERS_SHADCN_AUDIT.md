# Members-Only shadcn/ui Migration — Audit & Running Checklist

Branch: `new-look` · Scope: `website/app/(members-only)/**` (+ shared components used only by members).
Do **not** redesign `app/(public-site)`. Do **not** touch the mobile app.

Last updated by the migration agent. This file is the single source of truth for progress.

---

## 0. Environment facts (verified)

| Fact | Value |
|---|---|
| Framework | Next.js `^14.2.4` (App Router) |
| React | `^18` |
| Tailwind | `^3.3.0` (v3, **not** v4) |
| TypeScript | `5.9.3`, `strict: true` |
| Path alias | `@/* -> ./*` (also `@/components/*`) — shadcn defaults resolve cleanly |
| Existing `components.json` | none |
| `lib/utils.ts` (`cn`) | none |
| Installed already | `clsx`, `bootstrap` 5.3.5, `react-bootstrap` 2.10.4, Font Awesome (svg-core + solid + brands + react), `react-datepicker`, `reactflow`, `@zxing/browser`, `jspdf` |
| Missing for shadcn | `tailwind-merge`, `class-variance-authority`, `tailwindcss-animate`, `next-themes`, `lucide-react`, `@radix-ui/*` |
| Tailwind custom config | `tt-dark-red #ad2831`, `tt-gold #e3b11a`, `loop-scroll` animation, parallax `backgroundImage`s, `zIndex.100`. **Must be preserved.** |
| `darkMode` in tailwind config | not set (currently defaults to `media`) |

### Layout / theming architecture (important, fragile)

- Root `app/layout.tsx` renders `<ClerkProvider><html><body>` and imports `(public-site)/globals.css`.
- `app/(members-only)/layout.tsx` **also** renders its own `<ClerkProvider><html><body className="members-shell" data-theme="light">`, imports `bootstrap/dist/css/bootstrap.min.css` + `./members.css` + Font Awesome CSS. (Nested root layouts — pre-existing; preserve behavior, do not "fix" as part of this work.)
- `app/member/layout.tsx` (the **onboard** flow, outside the route group) also imports `bootstrap.min.css` + `(members-only)/members.css`. Any members.css cleanup must account for this consumer.
- Current theme = custom: `data-theme="light|dark"` on `body.members-shell`, persisted in `localStorage["member-theme"]`, toggled by `components/ThemeToggle.tsx` (View Transition circular reveal). Tokens live in `members.css` as `--tt-*` CSS variables under `.members-shell` and `.members-shell[data-theme="dark"]`.
- Public `globals.css` defines its own `:root` vars + `body` background gradient and `@tailwind` directives. **Tailwind's generated utilities reach member pages through this file** (loaded via the root layout). shadcn tokens must therefore be added **without** editing `globals.css` and **scoped** so the public body is untouched.

---

## 1. Route inventory

Legend: **S** = server component page, **C** = client page (`"use client"`). "Gate" = access/permission conditions observed.

| Route | Type | Purpose | Principal components | API / data | Gate |
|---|---|---|---|---|---|
| `/member` | C | Member dashboard / home (bento cards, quick actions, permission + profile review states) | `page.tsx`, `GemSheet` | `/api/members/me`, gem, notifications | member |
| `/member/profile/[rollNo]` | S | Member profile view/edit (photo, resume, info editors) | `ProfileClient`, `PhotoUploader`, `ResumeUploader`, `ProfileInfoEditor` | members API, S3 upload | self or admin |
| `/member/brothers` | S | Member directory | `MembersList` | members list API | member |
| `/member/brothers/[rollNo]` | S | Brother detail | `BrotherDetailClient` | members API | member |
| `/member/vote` | C | Voting (uses **react-bootstrap** — only file that does) | `page.tsx` | voting API | member |
| `/member/events` | C | Events list | `page.tsx` | events API | member |
| `/member/events/manage` | C | Create/manage events | `page.tsx` | events API | admin/superadmin/E-Council |
| `/member/events/committee` | C | Committee events | `page.tsx` | events API | admin/superadmin/E-Council/committee-head |
| `/member/events/[id]/check-in` | C | Event check-in (QR via `@zxing/browser`) | `page.tsx` | events check-in API | privileged |
| `/member/committees` | S | Committees overview | `CommitteesClient` | `/api/committees` | member |
| `/member/minutes` | C | Chapter minutes list | `page.tsx` | minutes API | member |
| `/member/minutes/[date]` | S | Minute detail | `MinuteDetailClient`, `MinuteFormModal` | minutes API | member / scribe edit |
| `/member/gem` | C | GEM (points) member view | `page.tsx`, `GemSheet` | gem API | member (any memberId) |
| `/member/dues` | C | Personal dues, plans, reimbursements, timeline | `page.tsx`, `FinanceTimeline`, `MarkAsPaidModal`, `RequestPlanModal`, `SubmitReimbursementModal` | dues API, S3 | member |
| `/member/lockdown` | C | Lockdown landing (uses `data-theme`) | `page.tsx` | `/api/lockdown`, `/api/members/me` | any (redirect target) |
| `/member/admin` | S | Admin dashboard hub | `admin/layout.tsx`, `page.tsx`, `LockdownControl` | admin APIs | admin/superadmin/E-Council |
| `/member/admin/members` | S | User management | `MembersList`, `MemberEditorModal`, `QuickToolsModal` | members admin API | admin/superadmin |
| `/member/admin/pending` | S | Pending members review | `PendingList` | pending API | admin/superadmin |
| `/member/admin/profiles` | S | Profile creation | `ProfileCreator`, `CreateProfileModal` | members API | admin/superadmin |
| `/member/admin/invite` | S | Invitations | `ClientInvitePanel`, `InviteForm`, `InvitationsList` | invite API | admin/superadmin |
| `/member/admin/committees` | C | Committee management | `page.tsx` | `/api/committees` | admin/superadmin |
| `/member/admin/gem` | C | Manage GEM | `page.tsx` | gem admin API | admin/superadmin (nav gates to `isAdmin`) |
| `/member/admin/dues` | C | Dues admin (history, credits, reminders) | `page.tsx`, `MemberHistoryModal`, `PayOutCreditModal`, `RemindModal`, `exportAudit.ts` | dues admin API, jsPDF export | admin/superadmin |
| `/member/admin/dues/requests` | C | Review payment/plan/reimbursement requests | `page.tsx`, `VerifyPaymentModal`, `ReviewPlanModal`, `ReviewReimbursementModal` | dues admin API | admin/superadmin |
| `/member/admin/family-tree` | S | Family tree admin (reactflow viz + importer) | `FamilyTreeImporter`, `FamilyTreeVisualization` | family API | admin/superadmin |
| `/member/admin/lockdown` | C | Lockdown control | `page.tsx`, `LockdownControl` | `/api/lockdown` | admin/superadmin |
| `app/member/onboard/[[...slug]]` | mixed | **Onboarding** (outside route group; reuses members.css + bootstrap JS) | `OnboardForm` | onboard API | new member |

Server pages: family-tree, invite, members, admin (hub), pending, profiles, brothers (+detail), committees, minutes/[date], profile/[rollNo]. Everything else is client.

---

## 2. Current UI inventory (measured)

| Pattern | Signal |
|---|---|
| React-Bootstrap components | **1 file only**: `member/vote/page.tsx` |
| Bootstrap CSS import | members layout + `app/member/layout.tsx` |
| Bootstrap **JS** (bundle) dynamic import | `components/Navbar.js`, `onboard/OnboardForm.tsx` |
| Bootstrap grid/utility classes | `d-flex` ×200, `col-*` ×202, `row` ×74, `container` ×31 (approx className occurrences) |
| Bootstrap component classes | `btn btn-*` ×216, `form-control` ×206, `card` ×158, `modal` ×356, `alert` ×83, `table` ×49, `badge` ×41, `form-select` ×39, `nav-*` ×29, `navbar` ×13, `dropdown` ×10 |
| Raw controls | `<button>` ×297, `<input>` ×184, `<textarea>` ×43, `<select>` ×39, `<table>` ×18 |
| Custom modal shells | **13** `*Modal*` files, all hand-rolled (`fixed inset-0` / `position:fixed` overlays, `onClose`) — no focus trap / restore |
| Font Awesome usage | **42 files** |
| react-icons | 0 in members-only (public-site only) |
| Custom CSS | `members.css` = **4532 lines**, 27 `--tt-*` custom properties, `.members-shell[data-theme=...]` overrides for cards, navbar, spinner, brothers controls, onboard, etc. |
| Hardcoded hex in JSX | scattered (`#666`, `#d99c45`, `#2c1614`, `#050611`, near-white paper tints …) — to be tokenized |
| Loading state | shared `components/LoadingState.tsx` (+ `.loading-spinner` CSS); many ad-hoc inline spinners |
| Empty/error/success | ad-hoc per page (Bootstrap `alert`, custom text) — no shared primitives |

---

## 3. Behavior that must not regress (contract)

- **Clerk**: `ClerkProvider` (root + members), `UserButton` in navbar, `middleware.ts` protection. Do not weaken.
- **Access gate**: `MembersOnlyAccessGate` fetches `/api/members/me`; `status === "removed"` → `MembershipRevokedState`; otherwise renders children after a `LoadingState`.
- **Lockdown**: `LockdownGuard` polls `/api/lockdown`; if active and user role ∉ {admin, superadmin} and path ∉ {`/member/lockdown`, `/member/admin`} → redirect to `/member/lockdown`. Fail-closed on error.
- **Navbar visibility rules** (from `Navbar.js`) — preserve exactly:
  - `isWaiting` = no userData OR pending OR needsPermissionReview OR needsProfileReview → hides all nav except Home.
  - `isPrivilegedUser` = admin | superadmin | isECouncil → shows **Admin** dropdown.
  - Admin dropdown → **User Management** only if `isAdmin` (admin|superadmin); **Manage GEM** for any privileged.
  - `showEventsDropdown` = `canSeeCommitteeEvents` (admin|superadmin|isECouncil|isCommitteeHead) OR `canSeeManageEvents` (admin|superadmin|isECouncil). Manage Events item gated on `canSeeManageEvents`; Committee Events item gated on `canSeeCommitteeEvents`.
  - Committee-head status resolved via `/api/committees?memberId=`.
  - `canSeeGem` = has `memberId`.
  - Profile link → `/member/profile/{rollNo}` (fallback `/member/profile`).
  - Main Site button → opens `/` in new tab and reloads it after 600ms (preserve behavior).
- Roles observed: `admin`, `superadmin`, plus flags `isECouncil`, `isCommitteeHead`, `pending`, `needsProfileReview`, `needsPermissionReview`, `status`.
- **Workflows to keep intact**: events, voting, GEM, dues/plans/reimbursements, committees, invitations, family-tree (reactflow), profile, minutes. Uploads (S3 photo/resume/receipt), QR check-in (`@zxing`), exports (jsPDF `exportAudit.ts`), wallet passes.
- Route URLs, deep links, query params, and route-state must not change.

---

## 4. Accessibility audit (current issues)

- **Modals**: 13 custom shells — no focus trap, no focus restoration on close, inconsistent Escape handling, backgrounds not always `aria-modal`/`role="dialog"` labelled. → migrate to `Dialog`/`AlertDialog` (Radix handles trap/restore/Esc).
- **Icon-only buttons** (theme toggle, notification bell, some actions): verify `aria-label`. ThemeToggle has `aria-label` ✓ but uses FA icons.
- **Navbar**: Bootstrap collapse via injected JS; keyboard/Escape/outside-click behavior tied to Bootstrap. Dropdowns use `<a href="#">` toggles (not buttons). → Sheet + DropdownMenu.
- **Contrast risks in current theme**: gold used as accents; dark theme is actually dark-*blue* (`#0a0f16`) not neutral black. Some muted grays on tinted paper.
- **Color-only status**: badges/alerts rely on Bootstrap color classes; need text/icon in addition.
- **Forms**: raw `<input>`/`<label>` associations inconsistent; errors not always programmatically linked; no live-region announcements for async results.
- **Headings**: verify order per page during migration.
- **Reduced motion**: ThemeToggle View Transition + `loop-scroll` marquee ignore `prefers-reduced-motion`.
- **Touch targets**: Bootstrap `btn-sm` and icon buttons may be < 44px.
- **Tables**: 18 raw tables — verify `<th scope>` and responsive handling (horizontal scroll on mobile).

---

## 5. Migration mapping (pattern → shadcn)

| Current | Target |
|---|---|
| Bootstrap `btn btn-*` / raw `<button>` | `Button` (variants: default/secondary/outline/ghost/destructive/link) |
| Bootstrap `card` / custom `.bento-card`, `.quick-card`, `.status-card` | `Card` + `CardHeader/Content/Footer`; shared `PageHeader`/`SectionHeader` |
| Custom modal shells | `Dialog` (tasks) / `AlertDialog` (destructive/consequential) |
| `form-control` / raw `<input>` | `Input` + `Label` + `Form` (field description + error association) |
| `<textarea>` | `Textarea` |
| `form-select` / raw `<select>` | `Select` (or native kept where simplest) |
| checkboxes | `Checkbox` / `RadioGroup` / `Switch` |
| Bootstrap `table` / raw `<table>` | `Table` on desktop + responsive card/list (`ResponsiveDataView`) on mobile |
| Bootstrap `nav`/`navbar`/`dropdown` + Bootstrap JS | `Sheet` (mobile) + `DropdownMenu` / `NavigationMenu` (desktop) |
| Bootstrap `badge` | `Badge` (status variants) |
| Bootstrap `alert` | `Alert` (error/warn/info) — persistent failures stay on-page |
| ad-hoc spinners / `LoadingState` | `Skeleton` + shared `LoadingState` |
| ad-hoc empty text | shared `EmptyState` |
| tooltips (FA titles) | `Tooltip` |
| datepicker (`react-datepicker`) | keep, or `Calendar`+`Popover` where clean |
| reactflow family tree | **keep** (specialized viz), theme its container tokens |
| QR (`@zxing`), jsPDF export, wallet | **keep** logic; restyle surrounding UI only |
| Font Awesome icons | `lucide-react` incrementally |
| `member-theme` / `data-theme` | `next-themes` `class` strategy, scoped to members shell |

---

## 6. CSS cleanup plan (members.css, 4532 lines)

- **Two consumers**: `(members-only)/layout.tsx` and `app/member/layout.tsx` (onboard). Removals must be safe for both.
- Separate: (a) navbar selectors (removed after Phase 3), (b) per-feature selectors (removed as each route migrates), (c) shared `--tt-*` tokens (superseded by shadcn tokens), (d) onboard selectors (keep until onboard migrated — out of primary scope but shares the file).
- Hardcoded colors → semantic tokens: `--tt-red #8b1b23` → `--primary` (light) / `--secondary` (dark); `--tt-gold #e1b21e` → `--secondary` (light) / `--primary` (dark); `--tt-ink`/`--tt-paper`/`--tt-card` → `--foreground`/`--background`/`--card`.
- Bootstrap-dependent selectors (`.members-navbar .nav-link`, `.dropdown-item`, `.navbar-toggler-icon`, `.form-control` overrides) removed once Bootstrap leaves.
- Duplicated card/table/modal/button styles collapse into shadcn components.
- **Do not delete anything until its route is migrated and verified** (Phase 6 only).

---

## 7. Design tokens & contrast matrix (validated)

Brand: dark red `#8b1b23`, gold `#e1b21e` (from current members.css `--tt-red`/`--tt-gold`). Note current tailwind config also had `tt-dark-red #ad2831` / `tt-gold #e3b11a` (public-site brand) — left untouched.

Semantic relationship:

**FINAL token values** (after live design review):

| Token | Light | Dark |
|---|---|---|
| background | `#fafafa` (off-white) | `#111113` (near-black) |
| foreground | `#12110f` | `#f5f3f0` |
| card | `#ffffff` | `#202024` |
| card-foreground | `#12110f` | `#f5f3f0` |
| primary | `#8b1b23` (dark red) | `#e1b21e` (gold) |
| primary-foreground | `#ffffff` | `#12110f` |
| secondary | `#e1b21e` (gold) | `#8b1b23` (dark red) |
| secondary-foreground | `#12110f` | `#f5f3f0` |
| muted / accent | `#f0f0f0` | `#27272b` / `#2b2b30` |
| muted-foreground | `#57534e` | `#b3aea8` |
| destructive | `#b91c1c` | `#ef4444` |
| destructive-foreground | `#ffffff` | `#111113` |
| border (decorative) | `#e4e4e4` | `#33333a` |
| input (control boundary) | `#8c8c8c` | `#78787f` |
| ring (focus) | `#8b1b23` | `#e1b21e` |
| radius | `0.875rem` | same |

**Measured WCAG contrast ratios** (sRGB, final values):

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| background / foreground | 18.08 | 17.04 | ≥4.5 text ✓ |
| card / card-foreground | 18.87 | 14.66 | ≥4.5 ✓ |
| primary / primary-foreground | 9.22 | 9.52 | ≥4.5 ✓ |
| secondary / secondary-foreground | 9.52 | 8.32 | ≥4.5 ✓ |
| muted / muted-foreground | 6.69 | 6.77 | ≥4.5 ✓ |
| destructive / destructive-fg | 6.47 | 5.00 | ≥4.5 ✓ |
| input border / background | 3.22 | 4.18 | ≥3 (UI) ✓ |
| ring / background | 8.83 | 9.60 | ≥3 (UI) ✓ |
| primary text / card | 9.22 | 8.19 | ≥4.5 ✓ |

Card-vs-background separation is intentionally low-contrast (1.04 light / 1.15 dark) — it is a *surface* distinction, carried by the `border` token, not an information-bearing contrast.

**Guardrails proven by measurement** (do not violate):
- Gold on white = **1.98** → gold is a surface with black text (9.52), never small gold text on white.
- Dark red text on black = **2.13** → never dark-red text on the dark background; use it as a filled surface with light text (8.32).
- Decorative `border` alone is ~1.4–1.6 (fine for separators); controls use the darker `input` token to meet 3:1.

No brand hue changes were required; both brand values pass in their assigned roles.

---

## 8. Phased migration plan & checklist

### Phase 2 — Foundation ✅ COMPLETE (verified)
- [x] Install deps (npm): `tailwind-merge class-variance-authority tailwindcss-animate lucide-react @radix-ui/react-slot` (next-themes tried then removed — see compat note)
- [x] `lib/utils.ts` (`cn`)
- [x] `components.json` (Tailwind 3, aliases, cssVariables, new-york, lucide)
- [x] Extend `tailwind.config.ts` (additive: `darkMode:["class"]`, semantic colors via `hsl(var(--*))`, radius, accordion keyframes, animate plugin) — existing colors/animations/backgroundImages preserved
- [x] Members-scoped token CSS `app/(members-only)/theme.css` (light `.members-shell` + `.dark`), imported before members.css — public `globals.css` untouched
- [x] Class-based `ThemeProvider` (custom, scoped, FOUC-blocking inline script, preserves `member-theme` pref, `.dark` + legacy `data-theme` mirror) + `ThemeToggle` rewired (Lucide icons, reduced-motion aware)
- [x] `components/ui/{button,card,skeleton}.tsx`; shared `components/shell/{PageShell,States}.tsx` (`PageContainer`, `PageHeader`, `SectionHeader`, `EmptyState`, `ErrorState`, `LoadingState`)
- [ ] `MemberShell`, `ResponsiveDataView` — deferred to pilot (Phase 4) so their API is shaped by real usage (avoid premature abstraction)
- [x] `npm run typecheck` + `npm run build` green (exit 0)

**Compatibility decision — next-themes → custom provider.** The preset URL (`b5UwPWIvnm`) was **unreachable (HTTP 500)**, so `shadcn init` was not run; the equivalent setup was scaffolded manually from the explicit color spec (safer given the nested-layout + public-site constraints). `next-themes`' `ThemeProvider` was installed and wired first, but it **broke `next build`'s "Collecting page data" step** with `PageNotFoundError: /_document` — a conflict with this repo's dual-root-layout architecture (the members layout renders its own nested `<html>`). Bisect confirmed: removing the provider → build passes; a self-contained class-based provider with the same shadcn contract (`.dark` class) + FOUC script → build passes. `next-themes` was uninstalled. No Next/React/Tailwind version changes were made.

### Phase 3 — Application shell 🟢 IMPLEMENTED (build-verified; authed visual pending)
- [x] `Navbar.js` → typed `Navbar.tsx`; all permission derivations copied verbatim (`canSeeCommitteeEvents`, `canSeeManageEvents`, `isPrivilegedUser`, `isAdmin`, `canSeeGem`, `showEventsDropdown`, `isWaiting`, committee-head lookup, profile href fallback)
- [x] Radix-based `Sheet` mobile menu + shadcn `NavigationMenu` desktop navigation (`components/ui/{sheet,navigation-menu}.tsx`), with Admin, Events, and More implemented as keyboard-accessible grouped panels; **Bootstrap JS import removed** from the navbar (only `OnboardForm` still loads it — separate later batch)
- [x] Preserved `UserButton`, `NotificationBell`, Main Site link (+ 600ms reload behavior), active-route indication (`aria-current`), theme toggle
- [x] Updated both consumers (`(members-only)/layout.tsx`, `app/member/layout.tsx`) to new import + `ThemeProvider`; deleted `Navbar.js`
- [x] `npm run typecheck` + `npm run build` green (exit 0). Public homepage confirmed visually unchanged in-browser.
- [ ] **Pending (needs a signed-in Clerk session):** authed visual pass of the full nav + keyboard/focus/Escape/outside-click walkthrough across light/dark × desktop/tablet/mobile. Radix Sheet/NavigationMenu provide focus management + Esc handling out of the box; to be confirmed live.

**Bootstrap heading leak in `AlertTitle` (second collision of this kind).** shadcn's `AlertTitle` renders an `<h5>` and sets no font size, so Bootstrap's `h5 { font-size: 1.25rem }` won by default — every `Alert` in the members area rendered with an oversized title and an inflated box (reported on the family-tree import screen; **12 members-only files** use `AlertTitle`). Fixed at the primitive: `AlertTitle` now declares `text-sm`. `mb-1`, `font-medium`, and `leading-none` were already immune, since a class selector outranks Bootstrap's element selector — only the unset property leaked. **Remove the comment, not the class, in Phase 6.**

A sweep for the same pattern across `app/(members-only)` found no other cases: every heading in migrated code carries an explicit `text-*`. The 121 bare headings that remain are all in un-migrated routes (`vote`, the Discord modal on the dashboard, etc.), where Bootstrap's sizing is still doing intentional work.

**Bootstrap ↔ Tailwind utility collision (transition bridge).** Bootstrap ships `.text-primary`/`.bg-primary`/`.text-secondary`/`.bg-secondary`/`.border-*` as `!important`, which overrode Tailwind's identically-named shadcn token utilities (symptom: active nav text rendered Bootstrap **blue** instead of brand red; shadcn `bg-primary` buttons would go blue too). Fix: a scoped bridge in `theme.css` re-points those six utilities at the brand tokens under `.members-shell` (higher specificity wins the `!important` tie). Side effect: legacy Bootstrap `primary`(blue)/`secondary`(gray) usages inside the members area adopt brand red/gold — desirable mid-migration. **Delete this block in Phase 6 when Bootstrap CSS is removed.** Only `primary`/`secondary` collide; `background/foreground/card/popover/muted/accent/destructive/border/input/ring` have no Bootstrap equivalent.

Bootstrap's global anchor color also leaked into an outline `Button asChild` résumé-download link because the outline variant previously relied on inherited text color. The shared outline variant now declares semantic `text-foreground`, preventing Bootstrap blue on any outline link while continuing to adapt to both themes.

**Known intermittent build blip:** `next build` occasionally throws `PageNotFoundError: /_document` during "Collecting page data" — a race in Next's static export under the dual-root-layout (nested `<html>`). Non-deterministic (re-running succeeds); compile always passes. Pre-existing architectural fragility, unrelated to this migration. Flagged as tech debt.

`ThemeToggle` was restyled to a shadcn `Button` (outline) to match the action cluster; `NotificationBell` was converted off Bootstrap/Font Awesome to a shadcn ghost icon button + token-styled panel (it was invisible in light mode because `btn-outline-light` is white-on-white). The old `.theme-toggle` members.css selectors are now dead (removed in Phase 6). Portalled Radix content (Sheet/menu) relies on `document.body` carrying `.members-shell` (it does in this layout) for token resolution — to confirm in the authed visual pass; if a portal ever renders un-themed, give those components a `container` inside the shell.

### Phase 4 — Pilot
- [x] **Member dashboard (`/member`)** — full overhaul. Every hook, fetch, permission branch, lockdown/onboard redirect, QR auto-refresh, and Apple Wallet flow preserved verbatim; presentation only.
  - Bootstrap modal shells → `Dialog` (QR check-in, chapter calendar) — real focus trap/restore/Esc via Radix.
  - Font Awesome → Lucide; `bento-card`/`status-card`/`tt-btn`/`perm-item` custom CSS → `Card`/`Alert`/`Badge`/`Button`.
  - Nested-card-in-card feed replaced with flat `divide-y` rows inside one Card (design rule: no excessive card nesting).
  - Added designed loading (`Skeleton`), empty, and error states; `Progress` for GEM; status meaning no longer rests on color alone (badges carry icon + text).
  - A Quick-actions grid was trialled and **removed** — it duplicated the navbar destinations and made the nav redundant. Dashboard content should be informational (data the nav can't show), not navigational.
- [x] **Shared `LoadingState`** (used by 37 files) converted off Font Awesome to a branded ΔΓ loader; identical `size` API so no call site changed. Motion respects `prefers-reduced-motion`.
- [x] **Form-heavy pilot: Edit Profile** — Bootstrap grid/form/button markup replaced with shadcn `Dialog`, `Card`, `Input`, `Textarea`, `Label`, `Select`, `Alert`, and `Button` primitives. The modal now has a fixed accessible header, independently scrollable form body, persistent action footer, labelled dynamic collection fields, explicit empty states, keyboard-accessible pledge-class selection, accessible removal names, loading state, and an announced save error. Save endpoint and payload remain unchanged.
- [x] **Brothers directory (`/member/brothers`)** — server page keeps every fetch, host/proto derivation, and the `active|alumni` + non-pending access gate verbatim; presentation only.
  - Local `Unauthorized()` shells in both brothers route files deleted in favour of the shared `MembershipRevokedState`, which was itself migrated off `bento-card` to a token `Alert` and given optional `title`/`description` props (the detail route's distinct copy is preserved through the prop).
  - `MembersList.tsx`: Bootstrap grid/`card`/`form-select`/`form-control`/`btn-outline-primary` and all Font Awesome icons replaced with `PageContainer` + `PageHeader`, `Input` (search), `Select` (status), `Card`, `Avatar`, `Badge`, `Button`, and `EmptyState`.
  - The **collapsing search toggle was removed**: a magnifier that expands an input is a keyboard/AT trap (the field is reachable while visually collapsed) and offered nothing over a permanently visible field. Search is now a labelled `Input` with a leading icon and an accessible "Clear search" button; the native WebKit clear affordance is suppressed so there is exactly one clear control.
  - Cards became a semantic `<ul>`/`<li>` grid (1 / 2 / 3 / 4 columns). Missing photos previously rendered a giant grey Font Awesome silhouette; they now use `AvatarFallback` initials. "View profile" and both social links carry `sr-only` member names so their accessible names are unique in a 60-card list, and social links announce that they open in a new tab.
  - Status is a `Badge` (`secondary` for Active, `muted` for Alumni) with the word visible — never colour alone; "You" is its own outline badge rather than a `(You)` suffix inside the name.
  - Result count is a `role="status" aria-live="polite"` line, so filtering is announced. Filtering/sorting logic is unchanged (numeric roll-number sort with lexical tiebreak), now memoised.
  - Lucide ships **no brand icons** (verified against `lucide-react@1.34.0`), so GitHub/LinkedIn are text buttons with an `ExternalLink` glyph rather than inlined brand SVGs — this also matches the already-migrated profile page.
- [x] **Brother detail (`/member/brothers/[rollNo]`)** — every hook, fetch, tally, permission derivation (`admin | superadmin | isECouncil`), and the privileged-vs-plain attendance split preserved verbatim.
  - Custom `.profile-tab` buttons → shadcn `Tabs` (roving focus, arrow-key navigation, correct `tabpanel` semantics).
  - Bootstrap modal shell → `Dialog`; the hand-rolled Escape-key `useEffect` and backdrop `onMouseDown` were deleted because Radix provides focus trapping, focus restoration, Esc, and outside-click natively.
  - `.profile-card` / `border rounded p-3` / `event-pill` → shared `Section`, `EntryItem`, `DetailRow`, `Stat`, and `Badge`; `<table class="admin-table">` → shadcn `Table` with `scope="col"` headers and an `sr-only` `<caption>`, plus a stacked card list under `sm` so attendance never scrolls sideways on mobile.
  - Attendance date inputs are now real `Label`/`Input` pairs (previously `form-label` with no `htmlFor`), the total is announced via `aria-live`, and the loading state is a `Skeleton` block rather than "Loading attendance…" text.
  - `<strong>Label:</strong> value` paragraphs became `<dl>`/`<dt>`/`<dd>` structures, and the résumé "not uploaded" `alert-warning` became plain muted text (it is an empty state, not a warning).
- [x] **Shared extraction:** `Section`, `Stat`, `DetailRow`, and `EntryItem` were duplicated verbatim across `ProfileClient` and the brother detail view (the same profile content with different affordances), so they moved to `components/shell/ProfileSections.tsx` and `ProfileClient` now imports them. Owner-only helpers (`AddPrompt`, `SectionEditButton`) stayed local.
- [x] **Brother quick-look dialog + detail reflow** (follow-up to the batch above)
  - The detail page's fixed `1.6fr / 1fr` two-stack layout left a tall void beside the sidebar for brothers with little filled in. It now uses **the same single flowing grid as `/member/profile`** (`grid gap-6 md:grid-cols-2`): About and the narrative sections span both tracks, compact sections pair up and reflow. Pledge Class joined the header stat row (four-up, matching the profile page), and a **Links** section was added from `socialLinks` — the same links the directory card already exposes to the same audience.
  - "View profile" in the directory now opens a **quick-look `Dialog`** (`BrotherQuickLook.tsx`) modelled on the `@7ovr/profile-1` block: cover band, overlapping avatar, identity block, inline stat row, and About / Chapter `Tabs`. It fetches `/api/members/[rollNo]` + `/api/committees?memberId=` on open, caches per roll number for the session, and shows skeleton / error states.
  - **Deep links are preserved:** `/member/brothers/[rollNo]` is untouched and still renders the full page; the dialog footer holds a real `<Link>` ("Open full profile") so cmd-click and open-in-new-tab still work.

**shadcn registry add — what it cost.** `shadcn add @7ovr/profile-1` (run with `--overwrite`) created `components/blocks/profile-1.tsx` **and silently reverted five themed primitives to stock**: `avatar`, `badge`, `button`, `separator`, `tabs`. Because `components/ui/` is untracked there was no git baseline, so the originals were recovered by grepping the pre-overwrite `.next` build output for the compiled class strings, and restored:
  - `button` — base regained `cursor-pointer`, `font-semibold`, `ring-offset-background`, and the **2px focus ring with offset** (stock new-york ships `ring-1`, no offset, which fails the 3:1 focus-indicator requirement); `outline` regained `text-foreground` (the Bootstrap-anchor-colour fix); sizes regained the touch-target scale (`default h-10`, `sm h-9`, `lg h-11`, `icon h-10 w-10` vs stock `h-9/h-8/h-10/h-9`).
  - `badge` — regained `rounded-full`, `gap-1`, `[&_svg]:size-3`, `border-border` on outline, and the **`success` / `warning` / `muted` status variants** (used across the migrated pages; stock has none, so their loss would have been a type error, but the shadow/`rounded-md` drift would not have been).
  - `tabs` — list back to `h-10 rounded-md`, active trigger `shadow-sm`, content `mt-5`; `avatar` root back to `size-10`.
  - The block itself was **deleted, not shipped**: it is authored for Tailwind v4 (`bg-linear-to-br`, `text-sm/relaxed`, flex-gap `Tabs`) and a `font-heading` token this repo doesn't define, and it carries hardcoded sample people. It was used as a design reference only.
  - The CLI also installed **`@base-ui/react`** (that registry's component library). A repo-wide search found no importer — every `components/ui/*` file still imports Radix — so it was uninstalled. No other dependency, and no Next/React/Tailwind version, changed.
  - **Lesson for later batches:** never run `shadcn add` with `--overwrite` against this repo while `components/ui/` is untracked. Commit `components/ui/` (or copy it aside) first so overwrites are diffable.
- [x] **Quick-look fixes + A–Z directory index**
  - **Clipped avatar fixed.** The card's `-mt-10` overlap onto the cover band sat inside the `overflow-y-auto` body, and a scroll container clips whatever crosses its top edge. `DialogContent` is now an explicit four-row grid (`grid-rows-[auto_auto_minmax(0,1fr)_auto]`): cover band, non-scrolling identity header, scrolling body, footer. Only the body scrolls, so the overlap survives.
  - **Not a theming bug.** The white dialog over a dark-looking page was light-mode rendering behind the `bg-black/80` overlay. Verified in-browser on the running dev server: `html.dark` is set, `body.members-shell` computes `--background: 240 7% 7%`, and a probe element appended to `document.body` (what Radix portals do) inherits the dark tokens correctly. No `container` prop needed.
  - **Alphabet index** (`AlphabetIndex.tsx`) for the 446-member directory: a new **Sort** control (`Last name (A to Z)` default, `Roll number` preserved as the previous behavior). In name mode the grid breaks into `<section>`s per letter with an `<h2>` heading, and an index jumps between them.
    - Sticky vertical rail beside the grid from `sm` up; on mobile the same index renders as a horizontally scrollable strip of **44px** targets, because 27 stacked letters cannot meet the touch-target size on a phone.
    - Letters with no members stay in place but are `disabled`, so positions never shift as filters change.
    - Jumping moves **keyboard focus** to the section heading (`tabIndex={-1}`, `focus({preventScroll:true})`), not just the scroll position, and honours `prefers-reduced-motion` (instant instead of smooth). Headings carry `scroll-mt-24` to clear the sticky navbar.
    - The rail's track is `pointer-events-none` with only the buttons interactive, so it never steals clicks from the cards beneath.
- [x] **Admin members: search-field clipping + `QuickToolsModal`** (coordinated with a parallel session that owns `admin/members/MembersList.tsx`)
  - **Search field.** The magnifier collided with the placeholder. The input carried `style={{ paddingInline: "2.5rem" }}`; an in-browser probe on the live dev server measured that inline rule computing correctly to 40px, so the inline style was replaced with plain `pl-10 pr-10` utilities (consistent with the brothers directory, and resolved by `tailwind-merge` over the base `px-3`), and the icon was pinned to `h-4 w-4` so it cannot fall back to lucide's 24px default attributes. The native WebKit clear affordance is suppressed with `appearance-none` to match the rest of the migration.
  - **`QuickToolsModal`** (Officer Election / Graduations / Purge Committees) fully migrated: custom `.modal d-block` shell → `Dialog`; `btn-close`/`btn btn-primary`/`btn btn-secondary` → `Button`; `form-select` → `Select`; `form-check-input` → a new `Checkbox` primitive; `list-group-item` rows and `row/col-lg-*` grids → token-styled bordered rows and CSS grid; `alert alert-*` → `Alert`; Font Awesome `faCheck`/`faKey`/`faTimes` and the literal `→` glyph → Lucide `Check`/`KeyRound`/`X`/`ArrowRight`.
  - **`Checkbox` was hand-written** rather than pulled with `shadcn add`, given the earlier incident where the CLI silently reverted five themed primitives. Only `@radix-ui/react-checkbox` was installed.
  - **Radix constraint handled:** `SelectItem` rejects `value=""`, which the "None Assigned" option used. A `UNASSIGNED` sentinel is mapped in the control only — state still stores `""` for unassigned, so the validation (`missingPositions`, uniqueness check) and the POST payload are byte-identical.
  - **Behavior preserved:** every handler, the two-step Review → Approve flow, the `canSubmitQuickTools` gate, the duplicate-assignment guard, the `filteredElectionMembers` eligibility logic, and all three `/api/members/quick-tools` payloads are untouched. `if (!show) return null` is retained so mount/unmount timing does not change.
  - **Two deliberate changes:** (1) the error `Alert` now renders in **both** steps — the old markup only rendered it in the editing step, so a failed submit set an error that was never displayed; (2) `onInteractOutside` is prevented, because the Bootstrap shell had no backdrop dismissal and a stray click would discard a half-filled election. Escape now closes the dialog, which the old shell did not support, and closing is blocked while `saving`.
- [x] **Roster search field — root cause and structural fix (confirmed fixed by the user).** Three attempts failed before the cause was measured, so it is worth recording: `cn()` = `clsx` + `tailwind-merge`, and **tailwind-merge only strips `pl-*`/`pr-*` when `px-*` comes LATER, not the reverse**. Running the real merge printed `"… px-3 … pl-10 pr-10"` — *both* survive, so clearance depended entirely on Tailwind's CSS source order rather than on the class list. Any "override the Input's padding" approach is therefore fragile. The field is now a **flex row that owns the chrome** (border, height, focus-within ring) with the icon, a bare `<input>`, and the clear button as siblings, so overlap is structurally impossible and no padding math is involved. **Use this pattern for every icon-in-field in the members area**; the brothers directory still uses the padding approach and should be converted if it ever drifts.
- [x] **Officer election: dropdown → searchable combobox.** A 447-entry `Select` was unusable. Replaced with a `Popover` + `Command` (cmdk) combobox: type to filter, then pick a result. cmdk's default scoring is a fuzzy subsequence match. Each item's search value includes the roll number, so "426" finds a member by roll as well as by name, and it keeps values unique for members who share a name (the roster has several).
  - `cmdk` installed; `components/ui/command.tsx` **hand-written** (same reasoning as `Checkbox` — the CLI reverted five themed primitives earlier).
  - The `UNASSIGNED` sentinel is gone; the combobox writes `""` for unassigned directly, so validation and the POST payload are unchanged.
  - **`<Popover … modal>` is required inside the Dialog.** `PopoverContent` portals to `<body>`, outside the Dialog's focus trap; without `modal` the trap pulls focus back and the search field cannot be typed into.
- [x] **Admin → Profiles (`/member/admin/profiles`)** — rebuilt to the roster's design language, minimal.
  - `ProfileCreator.tsx`: the "Create Profiles" hero card is gone; the page now opens with a `PageHeader` and a single action. One `Card` holds the roster header (title, "Showing X of Y", the flex search field, status `Select`) over a `Table` with `CardContent p-0` — the same composition as `admin/members`. Red `Edit`/`Delete` pill pairs on every row became one `⋯` `DropdownMenu`, and the collapsing magnifier toggle was dropped (same a11y reason as the brothers directory).
  - No avatars in these rows: placeholder profiles have no photos, so a column of grey initials would be noise. Roll number is mono, status uses the roster's `StatusBadge`, and "Directory hidden" is a quiet second line rather than a badge.
  - Both custom modal shells → `AlertDialog`: the filler-profile notice (a gate before creating) and the delete confirmation (destructive). **The delete `alert()` is gone** — a failure now renders in an `Alert` inside the dialog, and the dialog is held open via `event.preventDefault()` on the action so the message survives.
  - `CreateProfileModal.tsx` (1012 lines) fully migrated: `modal fade show` → `Dialog`; every `form-control`/`form-select`/`form-check-input` → `Input`/`Textarea`/`Select`/`Checkbox`; `row`/`col-*` grids → CSS grid; `<img>` → `Avatar` (also clearing a pre-existing `no-img-element` lint warning); Font Awesome → Lucide. Three local helpers (`Field`, `RepeatableSection`, `EntryCard`) removed the repetition across ~40 fields and the four repeatable groups, and gave every previously bare `placeholder`-only input an accessible name.
  - **Radix empty-value constraint again:** `big`, `little`, and `pledgeClass` all used `value=""`. Each maps through a `NONE` sentinel in the control only; state still stores `""`, so the save payload is unchanged.
  - `MemberEditorModal` (the "Edit profile" target) was already migrated by the parallel session, so the whole `admin/profiles` directory is now free of Bootstrap and Font Awesome.
  - Follow-up: `StatusBadge` is now duplicated between `admin/members` and `admin/profiles`. Worth extracting once that file is not being edited concurrently.
- [x] **Profiles: width parity + create/edit parity** (follow-up)
  - **Width.** The profiles page sat narrower than the roster because `admin/members` overrides the shared container to `max-w-7xl` while `ProfileCreator` used the default `max-w-6xl`. Now matched. **`max-w-7xl` is the admin-console page width** — use it for the remaining admin routes so the tab strip and page content stay aligned.
  - **Create now mirrors Edit.** `CreateProfileModal` was a two-column form while `MemberEditorModal` (built by the parallel session) uses a sidebar-nav shell. The create modal now reuses that shell verbatim: same `DialogContent` sizing (`flex h-[min(92vh,900px)] … max-w-6xl`), same header/alert/footer classes, and the same `Tabs` + `aside` sidebar. Sections are **Profile / Access & chapter / Links & highlights / Experience** — the editor's four, minus **History**, which a new profile has none of.
  - Fields regrouped to match the editor's information architecture: media + basics under Profile; identity, status, E-Council, and big/little under Access & chapter; links and skills/fun-facts under Links & highlights; the four repeatable groups under Experience. Profile media is now avatar-beside-buttons (`sm:flex-row sm:items-center`) rather than a stacked narrow column, and the footer is Cancel / Create profile with a `Check` icon, matching Save changes.
  - Local helpers now mirror the editor's (`SectionHeading`, `Field` with `description`), plus `RepeatableCard`/`EntryCard` for the repeatable groups.
- [x] **Admin → Family tree import (`/member/admin/family-tree`)**
  - Bootstrap `bento-card`/`form-control`/`alert alert-*`/`table` and Font Awesome replaced with `PageContainer`+`PageHeader`, `Card`, `Alert`, `Table`, `Badge`, `Button`, and Lucide icons.
  - **Real dropzone** in place of the bare `<input type="file">`: drag-and-drop with a `dragging` state, plus click-to-browse. The input is `sr-only` rather than `hidden`, so it stays focusable and in the a11y tree, and the drop target's ring is driven by `focus-within`. `handleFileChange(event)` was refactored to `handleFile(file)` so the input and the drop target share one path; parsing and validation are unchanged.
  - The chosen file renders through the repo's `Attachment` / `AttachmentMedia` / `AttachmentContent` / `AttachmentTitle` / `AttachmentDescription` / `AttachmentActions` primitives, with a size readout, an inline spinner while validating, and a Remove action that also clears the input's `value` (otherwise re-picking the same file fires no `change` event). The same attachment repeats at the top of the review step as context.
  - Three review counts became a `<dl>` of `SummaryTile`s (warnings turn amber only when non-zero); warnings/errors became `Alert`s with lists; both preview tables became `Table`s. A `Step N of 3` badge in the header makes the three-stage flow legible.
- [x] **Admin → Committees (`/member/admin/committees`)** — now matches the members/profiles layout.
  - `PageHeader` with Purge committees (destructive-tinted outline) + Add committee, then one `Card` + `Table`. Per-row `Edit`/`Delete` pills → a single `⋯` `DropdownMenu`; delete's custom modal → `AlertDialog`; member count → `Badge`; a designed empty state replaces the bare "No committees yet." row. Committee description now shows as a clamped second line under the name.
  - **Create and edit modals collapsed into one `CommitteeFormDialog`.** They were ~200 lines of duplicated markup differing only in payload; the fields were already identical.
  - **Both hand-rolled comboboxes replaced.** `SingleMemberPicker` and `MemberPicker` were bespoke input+suggestion-list widgets with their own arrow-key/highlight/blur-timeout logic. Both are now `Popover` + `Command` comboboxes (same pattern as the officer election), so filtering is fuzzy, roll numbers are searchable, and keyboard behaviour comes from cmdk instead of hand-written handlers. The multi-select shows its selection as removable `Badge`s and marks the current head as `Head` + disabled rather than silently filtering.
- [x] **Admin → Invite (`/member/admin/invite`)** — all three files migrated.
  - `ClientInvitePanel`: `bento-card` → `PageContainer`+`PageHeader` and two `Card`s (send / pending), with a `Skeleton` list while loading instead of a centred spinner. Hook order was tidied (states before the effect); both still run unconditionally so render order is unchanged.
  - `InviteForm`: `form-control`+`btn` → `Label`/`Input`/`Button`, a `sending` state (the submit button had none, so a slow invite looked inert), and the result `Alert` sits in an `aria-live="polite"` region wired to the input via `aria-describedby`.
  - `InvitationsList`: `list-group` → `Table` with status `Badge`s and a designed empty state. **Revoke now confirms** via `AlertDialog` — it previously fired on a single click with no undo.
- [x] **Admin → Lockdown (`/member/admin/lockdown`)**
  - `LockdownControl` rebuilt on `PageContainer`+`PageHeader` (status `Badge` in the header) with a status `Card` (countdown / started / scheduled end as a `<dl>`, reason in its own panel) and a controls `Card`. `form-control`/`btn`/`alert alert-*` → `Input`/`Label`/`Button`/`Alert`, results announced via `aria-live`.
  - **Engage now confirms** via `AlertDialog`, quoting the duration and reason, because it cuts every member off. Release stays one click: it is the recovery path.
  - `lockdown/page.tsx` dropped its `.admin-lockdown-container` wrapper (now dead CSS; removal deferred to Phase 6).
  - **Known pre-existing defect, not fixed (out of scope):** the countdown is a `useMemo` over `state.endsAt` with no interval, so it never ticks — it shows the value computed at load. Fixing it means adding a timer, which is behaviour, not presentation.
- [x] **Admin → Requests (`/member/admin/pending`)** — 966 lines, the last big one.
  - The `list-group` of requests → `Card` + `Table` (roll, name, submitted date, Review) with a designed empty state.
  - The 640-line Bootstrap review modal now uses **the same sidebar shell as the create/edit profile modals** — Profile / Access & chapter / Links & highlights / Experience — so all three profile-shaped editors in the admin console are now one design. Every `form-control`/`form-select`/`row`/`col-*` replaced; the four repeatable groups reuse the same `RepeatableCard`/`EntryCard` pattern, and every placeholder-only input gained an accessible name.
  - Footer regrouped: Close on the left, Save changes / Reject / Approve on the right, all with spinner states. **Reject now confirms** via `AlertDialog`.
  - `pledgeClass` goes through the `NONE` sentinel (Radix rejects `value=""`); `preferredStatus`/`preferredRole` never empty, so they map directly. `buildUpdates()` and both review endpoints are untouched.
- [x] **Admin → Dues (`/member/admin/dues` + `/dues/requests`)** — all 8 files. Presentation only: every `money()`/`amountCents` calculation, `buildUpdates`-equivalent payload, and API call is byte-identical.
  - **Roster page**: `container py-4` → `PageContainer`+`PageHeader` with Remind / Export / Requests actions; the five Bootstrap stat cards → a token `<dl>` grid; `btn-group` filter → `Tabs`; the search box uses the flex-field pattern; the table → shadcn `Table` with `tabular-nums` on every money column and `Badge`s for In review / on-a-plan / missed / Overdue.
  - **Requests page**: Bootstrap `nav-tabs` (plain buttons, no tab semantics) → `Tabs`/`TabsContent`, so the three queues get roving focus and arrow-key navigation. Three near-identical inline Bootstrap tables → shadcn `Table`s sharing new local `AgeBadge`, `QueueEmpty`, and `QueueTile` helpers (the waiting-time badge colour thresholds — red ≥7d, amber ≥3d — were duplicated three times).
  - **Five modals** (`MemberHistoryModal`, `PayOutCreditModal`, `RemindModal`, `VerifyPaymentModal`, `ReviewPlanModal`, `ReviewReimbursementModal`) → `Dialog`. All previously used `modal d-block` shells that **closed on any backdrop click** — mid-form, while recording money. The money-handling ones now prevent outside-click dismissal; Escape still closes, which none of them supported before.
  - `nav-pills` mode switchers inside the verify/reimbursement modals → `Tabs` (they were plain buttons with no tab semantics).
  - Currency inputs keep their `$` affix as a positioned span over a padded `Input`, and the "more than the credit owed" / outstanding-balance hints are now wired with `aria-describedby` + `aria-invalid` instead of floating `form-text` divs.
  - **`admin/` is now free of Bootstrap and Font Awesome except `gem/page.tsx`.**
- [x] **Dues follow-up fixes**
  - **Admin tab strip could not navigate back.** Radix does not fire `onValueChange` when the already-active trigger is clicked, and `/member/admin/dues/requests` resolves to the Dues tab via `pathname.startsWith`, so clicking Dues from the requests page did nothing and there was no way back. `TabsTrigger` now renders `asChild` around a `next/link`, which also restores cmd-click and middle-click. `useRouter` and `onValueChange` are gone from the layout.
  - **`$` sat on the first digit.** The same `cn()` trap as the search field: the affix was absolutely positioned over an `Input` whose base `px-3` survives alongside `pl-7`, so clearance depended on CSS source order. New `components/ui/currency-input.tsx` is a flex row that owns the field chrome, with the `$` and the input as siblings. Used by all three money inputs.
  - **Native date picker replaced.** New hand-written `components/ui/calendar.tsx` on react-day-picker v10 (the CLI's calendar targets a different major, and the CLI has overwritten themed primitives here before), wired into `VerifyPaymentModal` through a `Popover`. **The wire format is unchanged**: `parseYmd`/`toYmd` read and write `YYYY-MM-DD` from local date components, because `new Date("2026-08-23")` parses as UTC midnight and renders as the previous day in any negative-offset zone — exactly wrong for a value that decides whether someone paid on time.
  - **Copy:** removed the "dry run" jargon and every prose em dash across the migrated members-only files (10 files). Standalone `"—"` cells stay: they are an existing empty-value convention, not prose.
- [x] **Bootstrap anchor leak (third collision of this kind) + admin nav simplification**
  - **The leak.** Bootstrap's global `a { color: <blue> }` is an *element* selector, so it wins over any anchor whose colour is merely **inherited**. It surfaced when the admin tab triggers became `asChild` links (inactive tabs rendered blue). Two fixes, both at the primitive:
    - `Button`'s **`ghost`** variant now declares `text-inherit`. Ghost is meant to inherit, and "unset" is exactly the case Bootstrap captures, so every `ghost asChild` anchor in the app was vulnerable. This mirrors the `outline` → `text-foreground` fix from Phase 3.
    - The admin `TabsTrigger` links declare `text-muted-foreground no-underline`; `data-[state=active]:text-foreground` still wins when active.
  - **Rule for the rest of the migration:** any `asChild` anchor needs an explicit text colour class. `default`/`destructive`/`secondary`/`outline`/`link` all set one; `ghost` now does too. **Delete both bridges in Phase 6** with the Bootstrap import.
  - **Admin nav is now a single link, not a dropdown.** "User Management" and "Manage GEM" are gone from it. Destination is permission-aware so nothing is lost: admins go to `/member/admin/members` (the tab strip covers everything from there), while **E-Council members who are not admins go straight to `/member/admin/gem`** — the admin layout renders no tab strip for them, so a link to the roster would have stranded them. `NavDropdown`/`MenuLink`/`MobileSection` stay, still used by Events and More.
  - **GEM added to the admin tab strip** after Dues, so `Manage GEM` remains reachable for admins.
- [ ] Remaining admin debt: `gem/page.tsx` (its own Bootstrap/Font Awesome migration; now reachable from the tab strip)
- [ ] One table-heavy admin page (next)

**Concurrent-session note.** Mid-batch, `app/(members-only)/member/admin/members/MembersList.tsx` appeared deleted in the working tree while `admin/members/page.tsx` still imported it, breaking `tsc`; it was restored from `HEAD`. A **parallel Claude Code session in this repo is migrating that same admin route** and has since rewritten the file with its own shadcn version, which is what the working tree now holds — nothing was lost, and the restore was superseded rather than overwriting their work. Because several sessions are editing this repo at once, treat cross-batch `git status` deltas with care and re-check before restoring anything.

**Newly dead CSS (defer removal to Phase 6):** `.brothers-hero`, `.brothers-controls`, and the `.brothers-search*` rules under `.brothers-controls` no longer have a members-only consumer — but `.admin-search-controls .brothers-search__toggle` is still used by `admin/profiles/ProfileCreator.tsx`, and `.profile-card` / `.profile-hero` / `.event-pill` / `.profile-tab` remain in use by the onboard form, events, and committee routes. No selectors were removed in this batch.

**Light/dark surface corrections (from live review):**
- The legacy cream gradient on `.members-shell` and the blue-tinted dark gradient were removed from `members.css` — they overrode the token surfaces and violated the white/near-black requirement. Legacy `--tt-*` dark variables were re-tuned from blue-tinted to neutral near-black so un-migrated pages match.
- Final light surfaces: **off-white page `#fafafa` + pure-white cards `#ffffff`** (cards lift off the page without heavy shadows). Neutral greys replaced warm cream for `muted`/`accent`/`border`/`input`.
- **Dark-mode margin artifact fixed:** the public `globals.css` sets `body { background: <linear-gradient> ... }`; overriding only `background-color` left that gradient *image* painting on top, appearing as a grey wash in the page margins. `.members-shell` now uses the `background` shorthand to reset it.
- **Final dark surfaces: near-black, not pure black** (`background #111113`, `card #202024`, `border #33333a`) — the deeper page improves surface hierarchy without the harshness of absolute black. Gold remains the dark-mode primary with black foreground.
- **Navbar notification control:** the icon button is now a non-shrinking 36×36px square—the same `sm` height as its adjacent actions—with matching minimum dimensions so the crowded desktop action row cannot compress it into a narrow pill.
- **Radius increased globally** `--radius: 0.625rem → 0.875rem` (cards/dialogs 14px, buttons/inputs 12px, menu items 10px) — the first pass read as too boxy. Single token, so every shadcn primitive follows.
### Phase 5 — Route-by-route batches (profile, events, committees, minutes, voting, GEM, dues, admin, members, invitations, pending, profiles, family-tree, lockdown)
**Remaining Bootstrap/Font Awesome in `admin/`:** none — `gem/page.tsx` was cleared in an earlier batch and re-verified by the tokenised scan.

- [x] **Committees (`/member/committees`)** — Bootstrap/custom cards and controls replaced with `PageHeader`, `Tabs`, `Input`, `Button`, `Card`, `Badge`, `Alert`, and `Dialog`. Card density now matches the admin surfaces; committee names and head identities wrap without clipping. Member search, card/list modes, member-detail dialog, and PDF export behavior are preserved.
- [x] **Minutes index (`/member/minutes`)** — hero/search/custom minute cards moved to `PageHeader`, `Card`, `Input`, `Badge`, `Button`, and shared loading/empty states. The create shell is now a focus-managed `Dialog` with labelled shadcn form controls and inline errors; minute creation payloads, role/Scribe gate, event linkage, PDF upload, filtering, and detail URLs are unchanged.
- [x] **Dues — member surface (`/member/dues`), all 5 files.** `page.tsx` (balance hero, plan alerts, active/archived plans, outstanding/settled charges, claims), `MarkAsPaidModal`, `SubmitReimbursementModal`, `RequestPlanModal`, and `FinanceTimeline`. Presentation only: every `money()`/`amountCents` computation, `buildSchedule`/`maxInstallmentsFor` call, and API payload is byte-identical. The three hand-rolled modal shells became focus-managed `Dialog`s (backdrop dismissal deliberately blocked on all three — each records money). Bootstrap `bg-success`/`bg-danger` status badges became `Badge` status variants, which pair colour with text so meaning never rests on colour alone. `FinanceTimeline` renders on **both** the member page and the admin `MemberHistoryModal`; its stats grid moved from `row`/`col-*` to a self-contained CSS grid so both containers work unchanged.
- [x] **Event check-in (`/member/events/[id]/check-in`)** — scanner card, manual-search card, attendees `Table`, and the confirm shell as an `AlertDialog`. All `@zxing/browser` scanning refs, the check-in/manual-check-in payloads, and the admin/committee-head gate are untouched. The search field uses the flex-row-owns-the-chrome pattern (see the roster note above). Retired the `checkin-*` and `bento-card`/`hero-*` legacy selectors from this route.
- [x] **Onboarding (`app/member/onboard/[[...slug]]`, outside the route group)** — the last Bootstrap surface in the repo. `OnboardForm` (761 lines) moved to `Card`/`Input`/`Textarea`/`Select` + the shared collection primitives; `page.tsx`'s three gate states moved to `PageContainer`/`ErrorState`. **Removed the repo's last `bootstrap/dist/js/bootstrap.bundle.min.js` import**, so `types/bootstrap.d.ts` is now dead. The success shell is a deliberately non-dismissable `Dialog` (its built-in close X is hidden — with a controlled `open` and no `onOpenChange` it would render an inert control).
- [x] **Shared extraction:** `Field`, `CollectionCard`, and `CollectionItem` were local to `ProfileInfoEditor`; onboarding renders the same profile content, so they moved to `components/shell/FormSections.tsx` and both import them. Same precedent as the `ProfileSections` extraction above — the two forms must not drift.

**Status: `app/(members-only)/**` and `app/member/**` are free of Bootstrap classes and Font Awesome.** A tokenised scan (Bootstrap-*exclusive* classes only — spacing/flex names Tailwind shares are excluded, or the count is meaningless) reports 0 across both trees. Font Awesome has 2 consumers left repo-wide: `(members-only)/layout.tsx` (the core CSS import + `config`) and `components/ConnectWithDiscordButton.tsx` (`faDiscord`).

### Phase 6 — Cleanup (remove members.css dead selectors, Bootstrap CSS/JS, react-bootstrap, Font Awesome, `data-theme` remnants — only after deps confirmed unused repo-wide)

Risks per batch tracked inline as batches are executed.

**✅ COMPLETE.** Executed in one change, because the counter-measures and their cause had to leave together (removing a workaround before its cause, or after, reintroduces the bug inverted).

| # | Item | Outcome |
|---|---|---|
| 1 | Both `bootstrap.min.css` imports | removed (`(members-only)/layout.tsx`, `app/member/layout.tsx`) |
| 2 | Bootstrap CSS leak guard | removed from `theme.css` |
| 3 | Bootstrap collision bridge (6 `!important` re-points) | removed from `theme.css` |
| 4 | `AlertTitle` `text-sm` | **class kept, comment rewritten.** Tailwind preflight leaves heading sizes to inherit, so the explicit size is now the intended styling rather than a workaround. |
| 5 | `Button` `outline`/`ghost` colour overrides | removed — preflight already gives `<a>`/`<button>` `color: inherit`, which is upstream shadcn behaviour |
| 6 | `members.css` | **4503 → 172 lines.** See below. |
| 7 | `types/bootstrap.d.ts` | deleted (the JS bundle import it shimmed is gone) |
| 8 | `bootstrap`, `react-bootstrap`, `@types/bootstrap` | uninstalled |

**How the members.css cut was decided (not by eye).** Every class in a selector position was extracted (395 distinct) and checked against every `.ts/.tsx/.js/.jsx` file in `app/`, `components/`, and `lib/`. 371 had no reference anywhere. The 24 "referenced" hits were then checked individually, and most were false positives: shadcn *import paths* (`@/components/ui/alert`, `.../badge`, `.../card`, `.../table`), Tailwind utilities sharing a Bootstrap name (`border`, `rounded`, `bg-primary`), the English word "active" in copy, and `"profile-photo.jpeg"` — a filename, not a class. Several more (`brothers-search`, `committee-members`, `committee-search`) are `id`/`htmlFor` values, not classes.

Only four custom class families are actually rendered, and all four survive:
- `.members-shell` — the body class (font + min-height only; **background/foreground now come from theme.css tokens**, which is what the old gradient was blocking)
- `.committee-print*` — a print-only committee roster, screen-hidden by design, so it has no shadcn counterpart
- `.discord-link-modal*` and `.discord-connect-button*` — Discord blurple is a fixed brand colour and deliberately sits outside the theme tokens
- plus `::view-transition-old/new(root)`, which the ThemeToggle's reveal animation depends on

Also dropped: the `Fraunces` half of the Google Fonts import (its only consumers were legacy display headings) and the `--tt-*` custom properties (0 references left in CSS or JSX). `Manrope` is **kept** — it is the members-area body font, and the layout applies no `next/font` class of its own. A reduced-motion guard was added to the Discord button's hover transform, which the legacy rule lacked.

**One library-rendered class needed a manual check.** `.reactEasyCrop_Container` is emitted by `react-easy-crop`, not by our JSX, so a source-reference scan cannot see it. It was scoped as `.photo-editor__crop-frame .reactEasyCrop_Container`, and `.photo-editor__crop-frame` is no longer rendered — the selector could never match. The migrated `PhotoUploader` styles the cropper's wrapper with Tailwind (`bg-black`, bordered, rounded) instead. A sweep for other third-party selectors (`react*`, `rdp-*`, `cl-*`, `cmdk-*`, `fa-*`, `swiper-*`) found this was the only one.

### Font Awesome — deliberate stopping point

FA is **not** fully removed, and should not be. Two consumers remain: `components/ConnectWithDiscordButton.tsx` uses `faDiscord`, and `(members-only)/layout.tsx` imports the FA core CSS + `config` that it needs. `lucide-react` ships no Discord glyph (lucide excludes brand logos by policy), so there is nothing to migrate to. Every *other* FA usage in the members area is gone. Removing the last of it would mean hand-rolling a Discord SVG — a separate decision, not a migration leftover.

---

## 9. Verification log

| When | Command | Result |
|---|---|---|
| Phase 2 | `npm run typecheck` | ✅ exit 0 (clean) |
| Phase 2 | `npm run build` | ✅ exit 0 — "Compiled successfully"; all routes emitted. Only pre-existing lint warnings (`<img>`, exhaustive-deps) remain, unrelated to this work. |
| Phase 2 | Baseline build on stashed tree | ✅ exit 0 — confirmed the transient `/_document` failure was caused solely by next-themes, now removed. |
| Phase 3 | `npm run typecheck` | ✅ exit 0 |
| Phase 3 | `npm run build` | ✅ exit 0 — "Compiled successfully" with new Navbar/Sheet/NavigationMenu (DYNAMIC_SERVER_USAGE lines are pre-existing API-route static-gen logs, not failures) |
| Phase 3 | `npm run dev` + browser | Public `/` visually unchanged; `/member` shell renders with correct dark theme (system pref). Full nav blocked by Clerk auth. |
| Dark-surface + bell refinement | `npm run typecheck` + `npm run build` | ✅ both exit 0 — dark background deepened to `#111113`; bell fixed at a non-shrinking 36×36px to match adjacent `sm` buttons. Existing hook/image lint warnings and API static-generation logs remain unrelated. |
| Edit Profile form pilot | `npm run typecheck` + `npm run build` | ✅ both exit 0 — new shadcn/Radix dialog form compiles and all routes emit. Existing hook/image warnings and API static-generation logs remain unrelated. |
| Brothers batch | `npm run typecheck` | ✅ exit 0 (clean) |
| Brothers batch | `npm run build` (clean `.next`) | ✅ exit 0, twice consecutively — "Compiled successfully", lint clean for all changed files (only the pre-existing `<img>`/exhaustive-deps warnings in un-migrated routes). One intervening run hit the known non-deterministic `/_document` `PageNotFoundError`; re-runs pass. |
| Brothers batch | `grep -rE "fortawesome\|btn-\|col-(sm\|md\|lg)\|form-control\|form-select\|d-flex\|modal\|bento-card\|profile-card\|admin-table\|#[0-9a-f]{6}" member/brothers/` | ✅ no matches — zero Bootstrap classes, Font Awesome imports, custom modal shells, or raw hex in the migrated route |
| Brothers batch | Public-site diff | ✅ no file outside `app/(members-only)/` was modified in this batch |
| Brothers batch | Authed browser pass (light/dark × mobile/tablet/desktop, keyboard walkthrough of search, status select, tabs, résumé dialog) | ⏳ **not run** — still blocked by Clerk sign-in; carried forward with the Phase 3 visual backlog |
| Quick-look + A–Z | `npm run typecheck` | ✅ exit 0 (clean) |
| Quick-look + A–Z | `npm run build` | ⚠️ "Compiled successfully" + lint clean, but the run exits 1 on the known `/_document` `PageNotFoundError`. Root cause identified: **the user's `next dev` server is running against the same `.next` directory**, so `next build` races it. Builds passed exit 0 twice earlier in the session while no dev server was up. |
| Quick-look + A–Z | Theme cascade probe (in-app browser, live dev server) | ✅ `html.dark` set, `body.members-shell` computes dark `--background`/`--card`, body-appended probe element inherits them — portalled dialogs are correctly themed |
| Admin members batch | `npm run typecheck` | ✅ exit 0 (clean) |
| Admin members batch | `npm run build` | ⚠️ "Compiled successfully"; the run still exits 1 during prerender (`/_document`, `/500`, and a stale `.next/types/…/layout.ts`). All three are the dual-root-layout fragility plus **`.next` contention with the user's running `next dev`**. Stop the dev server for a clean build. |
| Admin members batch | `cn()` merge probe (node, real deps) | ✅ Printed `px-3 … pl-10 pr-10` — proved tailwind-merge does not strip `px-*` for a later `pl-*`, which is why two padding fixes appeared to do nothing |
| Admin members batch | User confirmation | ✅ Search field reported fixed after the flex-field rewrite |
| Admin profiles batch | `npm run typecheck` | ✅ exit 0 (clean) |
| Admin profiles batch | `npm run build` | ✅ "Compiled successfully", no lint warnings for either changed file (the pre-existing `<img>` warning in `CreateProfileModal` is gone). Run still exits 1 on the prerender/`.next`-contention issue described above. |
| Admin profiles batch | `grep -rE "fortawesome\|btn btn-\|modal fade" admin/profiles/` | ✅ no matches — directory fully migrated |
| Profiles parity follow-up | `npm run typecheck` | ✅ exit 0 (clean) |
| Profiles parity follow-up | `npm run build` | ✅ "Compiled successfully", zero lint warnings for either profiles file; run exits 1 on the known prerender/dev-server `.next` contention |
| Family tree + committees | `npm run typecheck` | ✅ exit 0 (clean) |
| Family tree + committees | `npm run build` | ✅ **exit 0** (clean run, dev server stopped) — "Compiled successfully", no lint warnings for either file |
| Family tree + committees | `grep -rE "fortawesome\|btn \|bento-card\|modal fade\|form-control"` on both routes | ✅ no matches |
| Invite + lockdown + requests | `npm run typecheck` | ✅ exit 0 (clean) |
| Invite + lockdown + requests | `npm run build` (clean `.next`) | ✅ **exit 0** — "Compiled successfully", no lint warnings for any changed file |
| Invite + lockdown + requests | `grep -rlE "fortawesome\|btn btn-\|modal fade\|bento-card" admin/` | ✅ only `dues/` (8 files) and `gem/page.tsx` remain |
| Dues batch | `npm run typecheck` | ✅ exit 0 (clean) |
| Dues batch | `npm run build` | ⚠️ "Compiled successfully"; run exits 1 on `/_document` + a prerender failure for `/member/admin/dues/requests`. **Proven pre-existing**: the dues directory was reverted to `HEAD` and rebuilt — the unmodified files produce the *identical* two errors. Files then restored. |
| Dues batch | `grep -rnE "fortawesome\|btn btn-\|modal fade\|form-control\|nav-pills\|nav-tabs" dues/` | ✅ no matches |
| Dues follow-up | `npm run typecheck` | ✅ exit 0 (clean) |
| Dues follow-up | `npm run build` | ✅ **exit 0** on a clean `.next`, zero `PageNotFoundError`. **Pattern now pinned down:** `rm -rf .next` → passes every time; an *incremental* rebuild over an existing `.next` → fails on `/_document`. Combined with the reverted-baseline test above, the `/_document` failures are stale-output artifacts, not code. Always `rm -rf .next` before a verification build. |
| Nav + leak fixes | `npm run typecheck` | ✅ exit 0 (clean) |
| Nav + leak fixes | `npm run build` (clean `.next`) | ✅ exit 0 — "Compiled successfully" |
| Member dues + check-in + onboard | `npm run typecheck` | ✅ exit 0 (clean) |
| Member dues + check-in + onboard | `npm run build` (`rm -rf .next` first) | ✅ **exit 0** — "Compiled successfully", zero `Build error`/`PageNotFoundError`. The stale-`.next` artifact above reappeared on the first incremental run and cleared on a clean rebuild, exactly as pinned down earlier. |
| Member dues + check-in + onboard | `npm run lint` | ✅ no new findings. One pre-existing `react-hooks/exhaustive-deps` warning at `check-in/page.tsx:95` (the data-fetching effect, untouched by this presentation-only change). |
| Member dues + check-in + onboard | Tokenised Bootstrap-exclusive scan over `app/(members-only)` + `app/member` | ✅ **0 files.** (A naive scan reports ~69 files because Bootstrap and Tailwind share `gap-2`/`p-0`/`border`/`flex-row`, and `text-muted` prefix-matches `text-muted-foreground` — the scan must exclude shared tokens or the number is noise.) |
| Member dues + check-in + onboard | `grep -rl "@fortawesome" app/(members-only) app/member` | ✅ only `(members-only)/layout.tsx` (core CSS + `config`); no `FontAwesomeIcon` render remains in either tree. |
| Member dues + check-in + onboard | `grep -rn "bootstrap" app components lib` | ✅ only the 2 CSS imports + dead `types/bootstrap.d.ts`. `react-bootstrap`: **0** imports repo-wide. |

Public-site-unchanged guarantee (structural): `globals.css` and all public/`app/member/onboard` layouts untouched; shadcn tokens scoped to `.members-shell`; `darkMode:["class"]` only affects members (repo-wide search found **zero** `dark:` variants outside members-only). Live visual diff of member routes deferred to the pilot (needs Clerk/DB auth).
