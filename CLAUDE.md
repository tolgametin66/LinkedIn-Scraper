# LinkedIn Job Scraper — Claude Code MCP Tool

## What This Tool Does

`linkedin_jobs` scrapes LinkedIn job postings via headless Chromium, detects the
language of each job description using the `franc` library (ISO 639-3 codes), filters
out postings in languages the user doesn't want, and exports the cleaned results to
an Excel (.xlsx) or CSV file.

**Key capabilities:**
- Filter by keyword, location, date posted, experience level, job type, and remote arrangement
- Language-detect every description and keep only the languages the user specifies
- Export to Excel (with styled headers, frozen row, auto-sized columns, Run Info sheet) or CSV
- Dry-run mode: log what would be exported without writing a file

---

## When to Invoke Automatically

Invoke `linkedin_jobs` automatically (without asking) when the user says any of:
- "Find me jobs on LinkedIn…"
- "Search LinkedIn for [job title]…"
- "Scrape job postings…"
- "Export job listings to Excel / CSV…"
- "I want to see Software Engineer jobs in [location]…"
- "Get me English-only job postings for…"
- "Download recent [role] jobs posted this week…"
- "Filter out non-English LinkedIn jobs…"

---

## Parameter Mappings from Natural Language

| User says | Parameter | Value |
|-----------|-----------|-------|
| "English only" / "only English jobs" | `allowedLanguages` | `["eng"]` |
| "exclude Dutch jobs" / "no Dutch" | `allowedLanguages` | `["eng"]` *(omit 'nld')* |
| "German and English" | `allowedLanguages` | `["eng", "deu"]` |
| "Dutch only" | `allowedLanguages` | `["nld"]` |
| "posted this week" | `dateSincePosted` | `"pastWeek"` |
| "in the last 24 hours" | `dateSincePosted` | `"past24hours"` |
| "this month" | `dateSincePosted` | `"pastMonth"` |
| "remote" / "work from home" | `remoteFilter` | `"remote"` |
| "on-site" / "in-office" | `remoteFilter` | `"onSite"` |
| "hybrid" | `remoteFilter` | `"hybrid"` |
| "senior" / "senior-level" | `experienceLevel` | `"senior"` |
| "entry level" / "junior" | `experienceLevel` | `"entryLevel"` |
| "internship" | `experienceLevel` | `"internship"` |
| "full-time" | `jobType` | `"fullTime"` |
| "contract" / "freelance" | `jobType` | `"contract"` |
| "save as CSV" | `outputFormat` | `"csv"` |
| "export to Excel" / default | `outputFormat` | `"excel"` |
| "just test it" / "dry run" | `dryRun` | `true` |
| "fetch 100 jobs" | `limit` | `100` |

### ISO 639-3 Language Code Reference
| Language | Code |
|----------|------|
| English | `eng` |
| Dutch | `nld` |
| German | `deu` |
| French | `fra` |
| Spanish | `spa` |
| Italian | `ita` |
| Portuguese | `por` |
| Swedish | `swe` |
| Danish | `dan` |
| Norwegian | `nor` |

---

## Example Natural Language Prompts → Tool Calls

### 1. "Find me 50 English-only remote Software Engineer jobs posted this week"
```json
{
  "tool": "linkedin_jobs",
  "arguments": {
    "query": "Software Engineer",
    "limit": 50,
    "remoteFilter": "remote",
    "dateSincePosted": "pastWeek",
    "allowedLanguages": ["eng"]
  }
}
```

### 2. "Scrape Product Manager jobs in Amsterdam, Dutch and English are fine, export to CSV"
```json
{
  "tool": "linkedin_jobs",
  "arguments": {
    "query": "Product Manager",
    "location": "Amsterdam",
    "allowedLanguages": ["eng", "nld"],
    "outputFormat": "csv"
  }
}
```

### 3. "Get senior Data Scientist jobs in Germany, English only, save to ./data/ds_jobs"
```json
{
  "tool": "linkedin_jobs",
  "arguments": {
    "query": "Data Scientist",
    "location": "Germany",
    "experienceLevel": "senior",
    "allowedLanguages": ["eng"],
    "outputPath": "./data/ds_jobs"
  }
}
```

### 4. "Do a dry run for full-time DevOps Engineer jobs posted in the last 24 hours"
```json
{
  "tool": "linkedin_jobs",
  "arguments": {
    "query": "DevOps Engineer",
    "jobType": "fullTime",
    "dateSincePosted": "past24hours",
    "dryRun": true
  }
}
```

### 5. "Find internship openings for UX Designer in London, any language is OK"
```json
{
  "tool": "linkedin_jobs",
  "arguments": {
    "query": "UX Designer",
    "location": "London",
    "experienceLevel": "internship",
    "allowedLanguages": ["eng", "fra", "deu", "spa", "ita", "por", "nld"]
  }
}
```

---

## Language Filtering Logic

- `franc` returns ISO 639-3 codes from the job description text
- If the code is in `allowedLanguages` → job is **kept** ✅
- If the code is NOT in `allowedLanguages` → job is **filtered** 🚫
- If the code is `'und'` (undetermined, usually too-short text) → job is **kept** ✅
- If detection throws an error → language set to `'unknown'`, job is **kept** ✅

---

## Output File Columns (in order)

1. Title
2. Company
3. Location
4. Date Posted
5. Job Type
6. Salary *(regex-extracted from description, or "N/A")*
7. Detected Language *(ISO 639-3)*
8. Job URL
9. Company URL
10. Description Preview *(first 300 chars, newlines → spaces)*

Excel also includes a **"Run Info"** sheet with the full query, all filters, counts, and timestamp.
