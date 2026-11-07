# Chapter MCP server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets a chapter member's AI assistant read and manage chapter data with the same permissions that member has on the website.

- URL: `https://ttdg.org/api/mcp`
- Transport: Streamable HTTP, stateless, JSON-RPC over `POST`. `GET` and `DELETE` answer 405 (no SSE stream, no sessions).
- Auth: OAuth 2.1 through Clerk. Any chapter member can connect; removed or deceased members and accounts not linked to a member are refused (403).

## Connecting

**Claude (claude.ai or the desktop app):** Settings > Connectors > Add custom connector, name it "Theta Tau", paste `https://ttdg.org/api/mcp`, and sign in with your chapter account when asked.

**Claude Code:**

```
claude mcp add --transport http ttdg https://ttdg.org/api/mcp
```

Then run `/mcp` inside Claude Code, pick `ttdg`, and authenticate in the browser.

**Any other MCP client:** point it at the URL. It will get a 401 with a `WWW-Authenticate` header, read the metadata at `/.well-known/oauth-protected-resource/api/mcp`, register itself with Clerk (dynamic client registration) and send you through the normal sign-in.

Start a conversation with "who am I on the chapter site?" and the assistant will call `whoami`, which lists what your account can do.

## Permission model

Every tool acts as the signed-in member and enforces the rules the website enforces, using the same server code (not a copy):

| Area | Rule |
| --- | --- |
| Events, read | Any member. Alumni only see events flagged visible to alumni. |
| Events, create | Admins and E-Council: chapter-wide or any committee. A committee's head or roster members: that committee only (`lib/eventAuth.ts`). |
| Events, edit / start / end / cancel | Admins, E-Council, and the head of the event's committee. Only admins can move an event to another committee. |
| Events, delete | Same as edit, except a completed event with a roll attached, which only an admin can delete (`lib/events/permissions.ts`). |
| Attendance, read | Roll of an event: any member who can see the event. A member's attendance history: admins and E-Council get the events, everyone else only a count. |
| Attendance, write | Admins, E-Council, and the head of the event's committee (`lib/checkinAuth.ts`). |
| Members, committees | Any member. Email, phone and website role are shown to admins and E-Council only; hidden profiles are visible to them only. |
| Dues | Your own: anyone. Anyone else's, and the chapter summary: admins and E-Council (`lib/duesAuth.ts`). Read-only. |
| Announcements | Admins, the Regent and the Vice Regent (`lib/chapterTools.ts`). Sending needs `confirm: true`. |
| Lifecycle sweep | Admins only. |
| Tasks | A committee's roster, its head, admins and E-Council (`lib/tasks/permissions.ts`). Anyone on the roster can create and edit any task; only the head or an admin deletes tasks or manages tags. Others get "Not found". |
| Bug reports | Triage tools: the tech committee (anyone who can see its tracker). |

A refused call returns an error result that says which rule applied.

## Tools

**Who and what**
- `whoami`: your member record, committees headed and joined, and what you can do.

**Events**
- `list_events`: filter by status, committee, date range, search text; default is upcoming only.
- `get_event`: one event with attendees and your permissions on it.
- `create_event`: including repeating series (`recurrence` with an end date, at most one year).
- `update_event`: change fields; `applyToSeries: "series"` updates future occurrences.
- `start_event`, `end_event`: move an event to ongoing / completed.
- `cancel_event` (destructive hint): cancel, optionally the whole future series.
- `delete_event` (destructive hint): permanent.
- `retire_stale_events`: admins only; runs the lifecycle sweep and reports how many events started and completed.

**Attendance**
- `list_attendance`: by event, or by member with an optional date range.
- `add_attendees`: member ids, roll numbers or full names.
- `remove_attendee` (destructive hint).

**Directory**
- `search_members`, `get_member`, `list_committees`, `get_committee`.

**Dues (read-only)**
- `get_my_dues`, `get_member_dues`, `dues_summary`.
- There is no dues write tool. Ledger writes record finance audit events, apply credit, notify members, and some touch Stripe, so they stay on the website and the app.

**Announcements**
- `list_announcements`: recent Notification Center sends.
- `send_announcement`: push / in-app / email to an audience. Without `confirm: true` it sends nothing and reports how many people it would reach. `test: true` sends only to you.

**Tasks** (default: the committee switched on as the Tech committee; pass `committee` for another)
- `list_tasks`: filter by status, assignee, `mine`, priority, due window, search. Returns keys like `TTDG-7K2M` and the roster.
- `get_task`: one task with its checklist and activity timeline.
- `create_task`, `update_task`: assignees and tags by name; `dueDate` is `YYYY-MM-DD` in Arizona time.
- `comment_on_task`: markdown comment; assignees and the creator are notified.

**Bug reports** (tech committee only)
- `list_bug_reports`: the triage queue (`view: new | open | all`), or one report with its full thread via `ref`.
- `triage_bug_report`: `accept` (creates the linked task), `duplicate` (with `of`), `wont_fix`, `need_info` (message required; the reporter sees it).

Creating or starting an event, sending an announcement, assigning a task and triaging a report notify members, exactly as the same actions do on the website.

## For maintainers

- Code: `lib/mcp/` (auth, OAuth metadata, tool definitions), route at `app/api/mcp/route.ts`, metadata routes under `app/.well-known/oauth-protected-resource*` and `oauth-authorization-server`.
- Token verification: `clerkMiddleware` verifies the Bearer token on every request; `lib/mcp/auth.ts` reads that result with `auth({ acceptsToken: "oauth_token" })`. OAuth tokens are rejected by every other route, because they use the default session-token mode.
- Tasks and bug reports: `lib/tasks/*` and `lib/bugs/*` are the service layer for the website routes, these tools and the cron.
- Shared logic that used to live in route handlers is now in `lib/events/{updateEvent,eventDetail,listEvents,attendance}.ts`, `lib/committeeQueries.ts`, `lib/duesRead.ts` and `lib/notify/sendBroadcast.ts`; the routes call those too.
- Clerk dashboard: Configure > Agents > MCP servers must contain `https://ttdg.org/api/mcp` with "Allow public clients" on.
- The metadata's `resource` and authorization server come from `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; on production those must be `https://ttdg.org` and the live key.
