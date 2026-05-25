#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { scrapeJobs } from "./scraper.js";
import { exportToCSV, exportToExcel } from "./exporter.js";
import type { ScraperParams, RunInfo } from "./types.js";

// ─── MCP Server setup ────────────────────────────────────────────────────────

const server = new Server(
  { name: "linkedin-scraper", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool registry ───────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "linkedin_jobs",
      description:
        "Scrape LinkedIn job postings based on user-defined filters. " +
        "Detects the language of each job description using franc (ISO 639-3 codes), " +
        "filters out postings that don't match the allowed languages, " +
        "and exports the results to a CSV or Excel file. " +
        "Invoke automatically when the user asks about finding jobs, LinkedIn job search, " +
        "job listings export, or wants to filter/download job postings.",
      inputSchema: {
        type: "object" as const,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description:
              "Job title or keyword to search for, e.g. 'Software Engineer', 'Product Manager'.",
          },
          location: {
            type: "string",
            description:
              "City, country, or 'Remote'. Omit for worldwide search. E.g. 'Amsterdam', 'United States'.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of job postings to fetch before language filtering (default: 50).",
            default: 50,
          },
          dateSincePosted: {
            type: "string",
            enum: ["past24hours", "pastWeek", "pastMonth"],
            description: "Only return jobs posted within this time window.",
          },
          experienceLevel: {
            type: "string",
            enum: [
              "internship",
              "entryLevel",
              "associate",
              "senior",
              "director",
              "executive",
            ],
            description: "Filter by required experience level.",
          },
          jobType: {
            type: "string",
            enum: [
              "fullTime",
              "partTime",
              "contract",
              "temporary",
              "internship",
            ],
            description: "Filter by employment type.",
          },
          remoteFilter: {
            type: "string",
            enum: ["remote", "onSite", "hybrid"],
            description: "Filter by work location arrangement.",
          },
          allowedLanguages: {
            type: "array",
            items: { type: "string" },
            description:
              "ISO 639-3 language codes for postings to keep (default: ['eng']). " +
              "Examples: 'eng' (English), 'nld' (Dutch), 'deu' (German), 'fra' (French), " +
              "'spa' (Spanish), 'ita' (Italian), 'por' (Portuguese). " +
              "Jobs with undetermined language ('und') are always kept.",
            default: ["eng"],
          },
          outputFormat: {
            type: "string",
            enum: ["csv", "excel"],
            description:
              "File format for the exported results (default: 'excel').",
            default: "excel",
          },
          outputPath: {
            type: "string",
            description:
              "Output file path without extension (default: './linkedin_jobs_<timestamp>'). " +
              "Example: './results/backend_jobs_june'.",
          },
          dryRun: {
            type: "boolean",
            description:
              "When true, scrapes and logs jobs but does not write any output file. " +
              "Useful for testing filters before committing to a full export.",
            default: false,
          },
        },
      },
    },
  ],
}));

// ─── Tool execution ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "linkedin_jobs") {
    throw new Error(`Unknown tool: "${name}"`);
  }

  if (!args || typeof args["query"] !== "string" || !args["query"].trim()) {
    return {
      content: [
        {
          type: "text",
          text: '❌ Missing required parameter: "query" must be a non-empty string.',
        },
      ],
      isError: true,
    };
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[T:]/g, "-")
    .replace(/\..+/, "");

  const params: ScraperParams = {
    query: (args["query"] as string).trim(),
    location: args["location"] as string | undefined,
    limit: typeof args["limit"] === "number" ? args["limit"] : 50,
    dateSincePosted: args["dateSincePosted"] as ScraperParams["dateSincePosted"],
    experienceLevel: args["experienceLevel"] as ScraperParams["experienceLevel"],
    jobType: args["jobType"] as ScraperParams["jobType"],
    remoteFilter: args["remoteFilter"] as ScraperParams["remoteFilter"],
    allowedLanguages: Array.isArray(args["allowedLanguages"])
      ? (args["allowedLanguages"] as string[])
      : ["eng"],
    outputFormat:
      args["outputFormat"] === "csv" || args["outputFormat"] === "excel"
        ? args["outputFormat"]
        : "excel",
    outputPath:
      typeof args["outputPath"] === "string"
        ? args["outputPath"]
        : `./linkedin_jobs_${timestamp}`,
    dryRun: args["dryRun"] === true,
  };

  try {
    const { jobs, totalScraped } = await scrapeJobs(params);

    const runInfo: RunInfo = {
      query: params.query,
      location: params.location,
      filters: {
        dateSincePosted: params.dateSincePosted,
        experienceLevel: params.experienceLevel,
        jobType: params.jobType,
        remoteFilter: params.remoteFilter,
        allowedLanguages: params.allowedLanguages?.join(", "),
      },
      totalScraped,
      totalAfterFilter: jobs.length,
      timestamp: new Date().toISOString(),
    };

    let outputFile = "";
    if (!params.dryRun && jobs.length > 0) {
      if (params.outputFormat === "csv") {
        outputFile = await exportToCSV(jobs, params.outputPath!);
      } else {
        outputFile = await exportToExcel(jobs, runInfo, params.outputPath!);
      }
    } else if (!params.dryRun && jobs.length === 0) {
      console.log("⚠️  No jobs passed the language filter — skipping file export.");
    }

    const lines = [
      `✅ Scraping complete!`,
      ``,
      `📊 Stats:`,
      `   • Total scraped from LinkedIn : ${totalScraped}`,
      `   • Passed language filter       : ${jobs.length}`,
      `   • Filtered out                 : ${totalScraped - jobs.length}`,
      `   • Allowed languages (ISO 639-3): ${(params.allowedLanguages ?? ["eng"]).join(", ")}`,
    ];

    if (params.dryRun) {
      lines.push(``, `🔍 Dry-run mode — no file was written.`);
    } else if (outputFile) {
      lines.push(``, `💾 Output file: ${outputFile}`);
    } else {
      lines.push(``, `⚠️  No output file written (0 jobs passed filter).`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Tool execution error:", err);
    return {
      content: [
        {
          type: "text",
          text: [
            `❌ An error occurred while running linkedin_jobs:`,
            ``,
            msg,
            ``,
            `Possible causes:`,
            `  • LinkedIn blocked the headless browser (try adding a delay or using a VPN)`,
            `  • Chromium is not installed (run: npx puppeteer browsers install chrome)`,
            `  • Network connectivity issue`,
          ].join("\n"),
        },
      ],
      isError: true,
    };
  }
});

// ─── Start server ────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
