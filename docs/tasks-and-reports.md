# Task tracker, bug reports and the rush editor

## Turning things on

An officer opens Manage committees, edits a committee and flips:

- **Tech committee**: owns the task tracker at `/member/tech` (short link `/tech`) and triages bug reports from `/report`.
- **Rush committee**: its head can edit the public `/rush` page at `/member/rush` (More menu).

One committee holds each switch at a time. Nothing is matched by committee name.

## Scheduling

Reminders (due soon, overdue, stale nudges) and the Monday 9am digest run on the in-process ticker in `lib/eventScheduler.ts`, every 15 minutes, between 8am and 9pm Arizona time. Production is one container on Coolify, so there is nothing to configure.

Optional manual trigger, for testing only:

| Coolify environment variable | Purpose |
| --- | --- |
| `TASKS_CRON_SECRET` | Enables `GET/POST /api/tasks/cron` with header `x-tasks-cron-secret: <value>`. Unset means the route answers 404. |

Every reminder is stamped in `Task.reminderState` (and `Committee.taskDigestSentAt`) before it is sent, so running the job twice sends nothing new.

## Where things live

- `lib/tasks/*`: tracker rules, service layer, notifications, cron, ICS.
- `lib/bugs/*`: bug portal service and permissions.
- `lib/rush/*`: rush page defaults, formatting, service.
- Uploaded images (rush poster, bug screenshots) go through `lib/storedImages.ts` into the newsletter bucket. Posters are public and immutable (`/api/rush/poster/...`); screenshots are access-checked per request (`/api/report/<ref>/screenshots/...`) and stored under `bugs/<memberId>/`, so a key can only be attached by the member who uploaded it.
- Checks: `npm run check:tasks`, `npm run check:rush`.

## Task keys

Every task key reads `TTDG-XXXX`: a random four-character code from
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O or 1/I), unique across all
committees (`Task.code`, partial unique index). Tasks created before codes
existed get one the first time their tracker list loads. Search accepts a
full key.

## Sharing

The share button on a task copies either the members link (sign-in required)
or a public read-only link at `/t/<token>`. The public page shows the title,
status, priority, due date, description, checklist, tag names and assignee
first names, never comments or history. Turning the link off clears
`Task.shareToken` and the page 404s. Both changes land in the timeline.

## Auto-sort (Groq)

Set `GROQ_API_KEY` (and optionally `GROQ_MODEL`, default
`openai/gpt-oss-20b`). In production it goes in the S3 secrets blob like every
other key. Without it nothing below runs.

- A new task with no tags or no priority gets them filled in a few seconds
  later. Only empty fields are filled; the timeline shows an "Auto-sort" line.
  It prefers existing tags and creates at most one new one.
- The head can press Auto-sort to sort up to 25 open, untagged tasks.
- A new bug report goes straight to the tech tracker's Todo column with a
  priority and tags, and the reporter sees "Accepted". Anything the model calls
  spam, or any failure, stays in Triage for a person.
