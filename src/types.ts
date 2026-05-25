export interface JobData {
  title: string;
  company: string;
  location: string;
  datePosted: string;
  jobType: string;
  salary: string;
  detectedLanguage: string;
  jobUrl: string;
  companyUrl: string;
  descriptionPreview: string;
  description: string;
}

export interface ScraperParams {
  query: string;
  location?: string;
  limit?: number;
  dateSincePosted?: "past24hours" | "pastWeek" | "pastMonth";
  experienceLevel?:
    | "internship"
    | "entryLevel"
    | "associate"
    | "senior"
    | "director"
    | "executive";
  jobType?: "fullTime" | "partTime" | "contract" | "temporary" | "internship";
  remoteFilter?: "remote" | "onSite" | "hybrid";
  allowedLanguages?: string[];
  outputFormat?: "csv" | "excel";
  outputPath?: string;
  dryRun?: boolean;
}

export interface RunInfo {
  query: string;
  location?: string;
  filters: Record<string, string | undefined>;
  totalScraped: number;
  totalAfterFilter: number;
  timestamp: string;
}

/** Raw data emitted by linkedin-jobs-scraper v18 */
export interface RawJobData {
  query: string;
  location: string;
  jobId: string;
  title: string;
  company?: string;
  companyLink?: string;
  companyImgLink?: string;
  place: string;
  date: string;
  dateText?: string;
  link: string;
  applyLink?: string;
  description: string;
  descriptionHTML: string;
  insights?: string[];
  skills?: string[];
}
