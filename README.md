# LinkedIn Job Scraper — Claude Code MCP Tool

A Claude Code MCP tool that scrapes LinkedIn job postings, detects their language,
filters out non-target-language posts, and exports clean results to **Excel** or **CSV**.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.0.0 |
| Chromium / Chrome | Latest stable |

### Install Chromium (if not already present)

```bash
# Via Puppeteer's built-in downloader (recommended)
npx puppeteer browsers install chrome

# macOS — via Homebrew
brew install --cask chromium

# Ubuntu / Debian
sudo apt-get install -y chromium-browser
```

> **Note:** `linkedin-jobs-scraper` uses Puppeteer under the hood.
> Puppeteer will attempt to auto-download Chromium during `npm install`.
> If it fails in your environment, install Chrome/Chromium manually and set
> the `executablePath` in the scraper constructor inside `src/scraper.ts`.

---

## Installation

```bash
git clone <this-repo>
cd LinkedIn-Scraper
npm install
npm run build        # compile TypeScript → dist/
```

---

## Register as a Claude Code MCP Tool

Add the following to your Claude Code MCP config (usually `~/.claude/mcp.json`
or via the Claude Code settings UI):

```json
{
  "mcpServers": {
    "linkedin-scraper": {
      "command": "node",
      "args": ["/absolute/path/to/LinkedIn-Scraper/dist/index.js"]
    }
  }
}
```

Then restart Claude Code. The tool `linkedin_jobs` will be available automatically.

---

## Development — Run Directly with tsx

For quick testing without building:

```bash
# Run the MCP server in dev mode (no build step)
npm run dev
```

Or invoke the scraper logic directly:

```bash
# Pipe a test call through the MCP protocol (requires jq)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"linkedin_jobs","arguments":{"query":"Software Engineer","limit":5,"dryRun":true}}}' \
  | npx tsx src/index.ts
```

---

## Example Invocations

### 1. English-only remote Software Engineer jobs (past week) → Excel
```
Query  : "Software Engineer"
Limit  : 50
Remote : remote
Date   : pastWeek
Langs  : eng
Format : excel (default)
```

### 2. Product Manager jobs in Amsterdam (Dutch + English) → CSV
```
Query    : "Product Manager"
Location : Amsterdam
Langs    : eng, nld
Format   : csv
Output   : ./results/pm_amsterdam
```

### 3. Senior Data Scientist jobs in Germany, English only → Excel
```
Query      : "Data Scientist"
Location   : Germany
Level      : senior
Langs      : eng
Output     : ./data/ds_germany
```

### 4. Dry-run — DevOps Engineer full-time jobs posted today
```
Query   : "DevOps Engineer"
Type    : fullTime
Date    : past24hours
Dry-run : true    ← prints results, no file written
```

---

## Output

### Excel (.xlsx)

| Sheet | Contents |
|-------|----------|
| LinkedIn Jobs | All scraped & filtered job rows with styled headers, frozen first row, auto-sized columns |
| Run Info | Query, filters used, total scraped, jobs kept, timestamp |

### CSV (.csv)

Standard comma-separated file with a header row. UTF-8 encoded.
Values containing commas or quotes are properly escaped.

**Columns (both formats, in order):**

1. Title
2. Company
3. Location
4. Date Posted
5. Job Type
6. Salary *(extracted from description where available, otherwise "N/A")*
7. Detected Language *(ISO 639-3 code)*
8. Job URL
9. Company URL
10. Description Preview *(first 300 characters)*

---

## Language Detection

Language is detected using [`franc`](https://github.com/wooorm/franc) — a lightweight,
offline library. It returns ISO 639-3 codes (e.g. `eng`, `nld`, `deu`, `fra`).

| Result | Meaning | Kept? |
|--------|---------|-------|
| `eng` (or any code in `allowedLanguages`) | Language matched | ✅ Yes |
| `nld` (or any code NOT in `allowedLanguages`) | Language not matched | 🚫 No |
| `und` | Undetermined (description too short) | ✅ Yes |
| `unknown` | Detection threw an error | ✅ Yes |

---

## Console Output Legend

| Prefix | Meaning |
|--------|---------|
| 📥 | Job scraped from LinkedIn |
| ✅ | Job passed language filter, will be exported |
| 🚫 | Job filtered out (wrong language) |
| ⚠️ | Warning (blocked, short description, processing error) |
| ❌ | Fatal error |
| 💾 | Output file saved |

---

## Responsible Usage & LinkedIn ToS

> **This tool is intended for personal research only.**

- LinkedIn's Terms of Service prohibit automated scraping.
  Use this tool only on your own behalf, at low volume, for research purposes.
- A 1–3 second random delay is added between language-processing steps to reduce
  request velocity. Additionally, Puppeteer's `slowMo: 300` is set to slow browser actions.
- Do not run this tool in CI/CD pipelines or at high frequency.
- Consider using the [LinkedIn API](https://developer.linkedin.com/) for production use cases.
- Adding longer delays (5–10 s) and a residential proxy significantly reduces
  the risk of being blocked.

---

## Troubleshooting

**"No jobs scraped"**
- LinkedIn may have detected the headless browser. Try:
  - Running from a different IP / VPN
  - Increasing `slowMo` in `src/scraper.ts`
  - Setting `headless: false` temporarily to see what LinkedIn shows

**"Chromium not found"**
```bash
npx puppeteer browsers install chrome
```

**TypeScript errors after `npm install`**
```bash
npm run typecheck
```

**Franc returning wrong languages**
- Ensure the job description is > 20 characters
- Descriptions in multiple languages may confuse the detector; the `detectedLanguage`
  column lets you verify and re-run with adjusted filters
