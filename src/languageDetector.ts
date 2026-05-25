import { franc } from "franc";

/**
 * Detects the ISO 639-3 language code for the given text.
 * Returns 'und' for undetermined (text too short), 'unknown' on error.
 */
export async function detectLanguage(text: string): Promise<string> {
  try {
    const cleaned = text.trim();
    if (cleaned.length < 20) {
      return "und";
    }
    const result = franc(cleaned, { minLength: 10 });
    return result || "und";
  } catch (err) {
    console.error("⚠️ Language detection failed:", err);
    return "unknown";
  }
}

/**
 * Decides whether a job should be kept based on its detected language.
 * Jobs with 'und' or 'unknown' are always kept (benefit of the doubt).
 */
export function shouldKeepJob(
  detectedLang: string,
  allowedLanguages: string[]
): boolean {
  if (detectedLang === "und" || detectedLang === "unknown") return true;
  return allowedLanguages.includes(detectedLang);
}
