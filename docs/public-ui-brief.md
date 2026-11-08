# Public site UI: bold, not chunky

The owner's note: the public site "looks very huge and chunky". Keep it bold, lose the chunk.

## Rules

1. **Display type stays heavy, in one or two places per page.** Bungee headings (`bungee.className`) for the page H1 and at most one section H2. Everything else is Inter/Nunito body type.
2. **Controls are compact.** Use the shared classes in `app/(public-site)/globals.css`:
   - `tt-button-primary` (gold), `tt-button-secondary` (outline), `tt-button-ghost`, add `tt-button-lg` only for a hero CTA. 40px tall, 14px/700, 8px radius, sentence case.
   - `tt-input` for inputs, selects, textareas (40px, 14px, 8px radius).
   - `tt-search` wrapper (leading 16px lucide `Search` icon, optional `<kbd className="tt-kbd">/</kbd>` on the right) around a `tt-input`.
   - `tt-chip` for filters and segmented options; selected state via `aria-pressed="true"` (toggle) or `aria-checked="true"` (radio role).
   - `tt-label` (13px/600), `tt-help` (12px muted), `tt-eyebrow` (12px, 0.12em tracking, gold).
   - `tt-card` (cream, 16px radius, 24px padding) and `tt-card-dark` (hairline panel on the dark page).
   - `tt-pill` for status pills (22px, 11px uppercase).
   - Put `tt-on-cream` on any cream container so inputs, chips and secondary buttons flip to dark ink.
3. **No wide letter-spacing** except the single display moment. Nav links, labels and buttons use 0 to 0.12em, never 0.2em+.
4. **Radii**: 8px controls, 12 to 16px cards. Nothing at 28 to 36px.
5. **Spacing**: field gap 14 to 16px, section gap 24 to 32px, card padding 20 to 24px (16 to 18px on phones).
6. **Contrast from colour, not size**: near-black page `#120a0a`, cream `#fbf6dc` cards, gold `#e2ab16` / `#f5d79a`, maroon `#7a0104` / `#b3202a`.
7. **Phones**: 16px side gutter, no horizontal scroll, 44px tap targets where it matters (inputs may stay 40px; make primary actions full width on phones).

## House rules (non-negotiable)

- No em dashes anywhere user-facing. Minimal copy, no footers that restate what the screen shows.
- No autofocus on `/report`, `/sign-in`, `/sign-up`.
- Icons: lucide (or the existing react-icons) borderless only. No circle, square or seal enclosed variants.
- Keep behaviour, data fetching, routes and accessibility labels intact. This is a visual pass.
- Tooling: npm scripts only, never npx. Do not start a dev server; one is already running on port 3000.
- Do not commit.
