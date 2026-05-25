import {
  LinkedinScraper,
  events,
  relevanceFilter,
  timeFilter,
  typeFilter,
  experienceLevelFilter,
  onSiteOrRemoteFilter,
} from "linkedin-jobs-scraper";
import { detectLanguage, shouldKeepJob } from "./languageDetector.js";
import type { JobData, RawJobData, ScraperParams } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs = 1000, maxMs = 3000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(ms);
}

function mapTimeFilter(
  value: ScraperParams["dateSincePosted"]
): (typeof timeFilter)[keyof typeof timeFilter] | undefined {
  switch (value) {
    case "past24hours":
      return timeFilter.DAY;
    case "pastWeek":
      return timeFilter.WEEK;
    case "pastMonth":
      return timeFilter.MONTH;
    default:
      return undefined;
  }
}

function mapExperienceFilter(
  value: ScraperParams["experienceLevel"]
): (typeof experienceLevelFilter)[keyof typeof experienceLevelFilter] | undefined {
  switch (value) {
    case "internship":
      return experienceLevelFilter.INTERNSHIP;
    case "entryLevel":
      return experienceLevelFilter.ENTRY_LEVEL;
    case "associate":
      return experienceLevelFilter.ASSOCIATE;
    case "senior":
      return experienceLevelFilter.MID_SENIOR;
    case "director":
      return experienceLevelFilter.DIRECTOR;
    case "executive":
      return experienceLevelFilter.EXECUTIVE;
    default:
      return undefined;
  }
}

function mapTypeFilter(
  value: ScraperParams["jobType"]
): (typeof typeFilter)[keyof typeof typeFilter] | undefined {
  switch (value) {
    case "fullTime":
      return typeFilter.FULL_TIME;
    case "partTime":
      return typeFilter.PART_TIME;
    case "contract":
      return typeFilter.CONTRACT;
    case "temporary":
      return typeFilter.TEMPORARY;
    case "internship":
      return typeFilter.INTERNSHIP;
    default:
      return undefined;
  }
}

function mapRemoteFilter(
  value: ScraperParams["remoteFilter"]
): (typeof onSiteOrRemoteFilter)[keyof typeof onSiteOrRemoteFilter] | undefined {
  switch (value) {
    case "remote":
      return onSiteOrRemoteFilter.REMOTE;
    case "onSite":
      return onSiteOrRemoteFilter.ON_SITE;
    case "hybrid":
      return onSiteOrRemoteFilter.HYBRID;
    default:
      return undefined;
  }
}

function extractSalary(description: string): string {
  const patterns = [
    /\$\s*[\d,]+(?:\s*[-–]\s*\$\s*[\d,]+)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|annum))?/i,
    /[\d,]+(?:\s*[-–]\s*[\d,]+)?\s*(?:USD|EUR|GBP|CAD|AUD)(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|annum))?/i,
    /(?:salary|compensation|pay)[:\s]+\$?\s*[\d,]+(?:\s*[-–]\s*\$?\s*[\d,]+)?/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return match[0].replace(/\s+/g, " ").trim();
  }
  return "N/A";
}

export async function scrapeJobs(
  params: ScraperParams,
  log: (msg: string) => void = console.log
): Promise<{ jobs: JobData[]; totalScraped: number }> {
  const {
    query,
    location,
    limit = 50,
    dateSincePosted,
    experienceLevel,
    jobType,
    remoteFilter,
    allowedLanguages = ["eng"],
    dryRun = false,
  } = params;

  const rawJobs: RawJobData[] = [];

  const scraper = new LinkedinScraper({
    headless: "new",
    slowMo: 300,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--lang=en-GB",
    ],
  } as never);

  const filters: Record<string, unknown> = {};
  const mappedTime = mapTimeFilter(dateSincePosted);
  if (mappedTime !== undefined) filters["time"] = mappedTime;
  const mappedExp = mapExperienceFilter(experienceLevel);
  if (mappedExp !== undefined) filters["experience"] = [mappedExp];
  const mappedType = mapTypeFilter(jobType);
  if (mappedType !== undefined) filters["type"] = [mappedType];
  const mappedRemote = mapRemoteFilter(remoteFilter);
  if (mappedRemote !== undefined) filters["onSiteOrRemote"] = [mappedRemote];
  filters["relevance"] = relevanceFilter.RECENT;

  try {
    scraper.on(events.scraper.data, (data: RawJobData) => {
      rawJobs.push(data);
      log(
        `📥 Scraped [${rawJobs.length}/${limit}]: "${data.title}" at ${
          data.company ?? "Unknown Company"
        } · ${data.place}`
      );
    });

    scraper.on(events.scraper.error, (err: string | Error) => {
      const msg = err instanceof Error ? err.message : String(err);
      log(`❌ Scraper error: ${msg}`);
    });

    scraper.on(events.scraper.end, () => {
      log(`\n📡 Scraper finished. Raw jobs collected: ${rawJobs.length}`);
    });

    const activeFilters = Object.keys(filters).filter((k) => k !== "relevance");
    log(
      `\n🔍 Searching LinkedIn for "${query}"${
        location ? ` in "${location}"` : ""
      }...`
    );
    if (activeFilters.length > 0) {
      log(`📋 Active filters: ${activeFilters.join(", ")}`);
    }
    log(
      `📏 Limit: ${limit} jobs | Allowed languages: ${allowedLanguages.join(", ")}\n`
    );

    const queryOptions: Record<string, unknown> = { limit, filters };
    if (location) queryOptions["locations"] = [location];

    await scraper.run([{ query, options: queryOptions }], {} as never);

    if (rawJobs.length === 0) {
      log(
        "⚠️  No jobs were scraped. LinkedIn may have blocked the headless browser, " +
          "or there are no results matching your filters."
      );
      log("   💡 Try: removing filters · using LI_AT_COOKIE · VPN · different query");
    }
  } finally {
    try {
      await scraper.close();
      log("🔒 Browser closed.");
    } catch (closeErr) {
      log(
        `⚠️  Error closing browser: ${
          closeErr instanceof Error ? closeErr.message : String(closeErr)
        }`
      );
    }
  }

  log(`\n🌐 Running language detection on ${rawJobs.length} job(s)...\n`);

  const jobs: JobData[] = [];

  for (let i = 0; i < rawJobs.length; i++) {
    const data = rawJobs[i];
    if (i > 0) await randomDelay(1000, 3000);

    try {
      const description = data.description ?? "";
      const lang = await detectLanguage(description);
      const keep = shouldKeepJob(lang, allowedLanguages);
      const idx = `[${i + 1}/${rawJobs.length}]`;

      if (keep) {
        log(
          `✅ ${idx} KEPT     "${data.title}" @ ${
            data.company ?? "Unknown"
          } — lang: ${lang}`
        );
      } else {
        log(
          `🚫 ${idx} FILTERED "${data.title}" @ ${
            data.company ?? "Unknown"
          } — lang: ${lang}`
        );
      }

      if (keep) {
        if (dryRun) {
          log(`   🔍 Dry-run: would export this job`);
        } else {
          const descriptionPreview = description
            .replace(/\n+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 300);
          const jobTypeLabel =
            data.insights?.find((s) =>
              /full.time|part.time|contract|temporary|internship/i.test(s)
            ) ?? "";
          jobs.push({
            title: data.title ?? "",
            company: data.company ?? "",
            location: data.place ?? location ?? "",
            datePosted: data.dateText ?? data.date ?? "",
            jobType: jobTypeLabel,
            salary: extractSalary(description),
            detectedLanguage: lang,
            jobUrl: data.link ?? "",
            companyUrl: data.companyLink ?? "",
            descriptionPreview,
            description,
          });
        }
      }
    } catch (err) {
      log(
        `⚠️  Error processing job [${i + 1}] "${data.title}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      if (!dryRun) {
        jobs.push({
          title: data.title ?? "",
          company: data.company ?? "",
          location: data.place ?? location ?? "",
          datePosted: data.dateText ?? data.date ?? "",
          jobType: "",
          salary: "N/A",
          detectedLanguage: "unknown",
          jobUrl: data.link ?? "",
          companyUrl: data.companyLink ?? "",
          descriptionPreview: (data.description ?? "")
            .replace(/\n+/g, " ")
            .substring(0, 300),
          description: data.description ?? "",
        });
      }
    }
  }

  log(
    `\n📊 Results: ${rawJobs.length} scraped → ${jobs.length} passed language filter` +
      (dryRun ? " (dry-run, no file written)" : "")
  );

  return { jobs, totalScraped: rawJobs.length };
}
