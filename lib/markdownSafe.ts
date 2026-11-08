// lib/markdownSafe.ts
// Markdown for task descriptions, comments and bug reports, rendered to HTML
// that is safe to inject: raw HTML in the source is shown as text, images are
// dropped, and links keep only http(s), mailto and site-relative targets.
// Mentions (`@[Name](id)`) render as links to that brother's profile.
import { Marked } from "marked";

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function safeHref(href: string): string | null {
  const value = (href || "").trim();
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

const md = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html({ text }) {
      return escape(text);
    },
    image({ text }) {
      return escape(text || "");
    },
    link({ href, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const safe = safeHref(href);
      if (!safe) return inner;
      const external = /^https?:/i.test(safe);
      const mention = /^\/member\/brothers\/id\/[a-f0-9]{24}$/.test(safe);
      return `<a href="${escape(safe)}"${mention ? ' class="tt-mention"' : ""}${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""}>${inner}</a>`;
    },
  },
});

export function renderMarkdown(source: string): string {
  const withMentions = (source || "").replace(
    /@\[([^\]]{1,80})\]\(([a-f0-9]{24})\)/gi,
    (_m, name: string, id: string) => `[@${name.replace(/[*_`[\]]/g, "")}](/member/brothers/id/${id.toLowerCase()})`
  );
  return md.parse(withMentions) as string;
}
