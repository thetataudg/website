# Clerk email delivery

The website sends these nine Clerk account emails through Resend after receiving
an `email.created` webhook. The HTML files in this folder are generated previews
of the templates used by the webhook.

Run `npm run clerk:emails` after changing `lib/notify/clerkEmailTemplates.ts`.

Production setup:

1. Point the Clerk webhook to `https://ttdg.org/api/clerk/webhook`.
2. Subscribe it to `email.created`.
3. Set `CLERK_WEBHOOK_SECRET` and `RESEND_API_KEY` in the website environment.
4. Deploy the website.
5. Disable `Delivered by Clerk` for each available template only after the
   deployed webhook has been tested.
