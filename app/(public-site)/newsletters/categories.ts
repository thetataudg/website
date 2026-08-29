import type { NewsletterCategory } from "@/lib/newsletterTypes";

/// How each category is written for a reader.
///
/// Kept out of `lib/newsletters` so that module stays free of presentation:
/// the iOS app has its own labels and its own SF Symbol for each of these, and
/// the two do not have to agree on wording to agree on the stored value.
export const CATEGORY_LABELS: Record<NewsletterCategory, string> = {
  chapter: "Chapter",
  brotherhood: "Brotherhood",
  professional: "Professional",
  service: "Service",
};
