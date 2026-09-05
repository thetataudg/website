import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CLERK_EMAIL_TEMPLATES,
  renderClerkTemplate,
} from "../lib/notify/clerkEmailTemplates";

const outputDirectory = path.join(process.cwd(), "clerk-email-templates");

async function main() {
  await mkdir(outputDirectory, { recursive: true });

  for (const template of CLERK_EMAIL_TEMPLATES) {
    const rendered = renderClerkTemplate(template);
    await writeFile(
      path.join(outputDirectory, `${rendered.slug}.html`),
      rendered.html,
      "utf8"
    );
  }

  console.log(`Generated ${CLERK_EMAIL_TEMPLATES.length} Clerk email templates.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
