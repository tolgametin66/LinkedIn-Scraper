import express, { type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { scrapeJobs } from "./scraper.js";
import { exportToCSV, exportToExcel } from "./exporter.js";
import type { ScraperParams, RunInfo } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const DOWNLOADS_DIR = join(process.cwd(), "downloads");

if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// ─── Job state ────────────────────────────────────────────────────────────────

interface Job {
  status: "running" | "done" | "error";
  logs: string[];
  result?: { totalScraped: number; passed: number; file?: string };
  error?: string;
  clients: Set<Response>;
}

const jobs = new Map<string, Job>();

function broadcast(job: Job, payload: object) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of job.clients) {
    res.write(line);
  }
}

function jobLog(job: Job, message: string) {
  job.logs.push(message);
  broadcast(job, { type: "log", message });
  // Also mirror to server stdout
  process.stdout.write(message + "\n");
}

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ── SSE: stream live logs for a job ─────────────────────────────────────────
app.get("/api/events/:jobId", (req: Request, res: Response) => {
  const job = jobs.get(req.params["jobId"]);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Replay buffered logs for late-connecting clients
  for (const msg of job.logs) {
    res.write(`data: ${JSON.stringify({ type: "log", message: msg })}\n\n`);
  }

  if (job.status === "done") {
    res.write(
      `data: ${JSON.stringify({ type: "done", ...job.result })}\n\n`
    );
    res.end();
    return;
  }
  if (job.status === "error") {
    res.write(
      `data: ${JSON.stringify({ type: "error", message: job.error })}\n\n`
    );
    res.end();
    return;
  }

  job.clients.add(res);
  req.on("close", () => job.clients.delete(res));
});

// ── POST /api/scrape: start a new scrape job ─────────────────────────────────
app.post("/api/scrape", (req: Request, res: Response) => {
  const body = req.body as ScraperParams;

  if (!body.query?.trim()) {
    res.status(400).json({ error: '"query" is required' });
    return;
  }

  const jobId = randomUUID();
  const job: Job = { status: "running", logs: [], clients: new Set() };
  jobs.set(jobId, job);
  res.json({ jobId });

  // Run scrape asynchronously — do NOT await
  void (async () => {
    try {
      const log = (msg: string) => jobLog(job, msg);
      const { jobs: scraped, totalScraped } = await scrapeJobs(body, log);

      const runInfo: RunInfo = {
        query: body.query,
        location: body.location,
        filters: {
          dateSincePosted: body.dateSincePosted,
          experienceLevel: body.experienceLevel,
          jobType: body.jobType,
          remoteFilter: body.remoteFilter,
          allowedLanguages: body.allowedLanguages?.join(", "),
        },
        totalScraped,
        totalAfterFilter: scraped.length,
        timestamp: new Date().toISOString(),
      };

      let outputFile: string | undefined;

      if (!body.dryRun && scraped.length > 0) {
        const ts = new Date()
          .toISOString()
          .replace(/[T:]/g, "-")
          .replace(/\..+/, "");
        const stem = body.outputPath
          ? basename(body.outputPath)
          : `linkedin_jobs_${ts}`;
        const outputPath = join(DOWNLOADS_DIR, stem);

        if (body.outputFormat === "csv") {
          outputFile = await exportToCSV(scraped, outputPath, log);
        } else {
          outputFile = await exportToExcel(scraped, runInfo, outputPath, log);
        }
        outputFile = basename(outputFile);
      } else if (!body.dryRun && scraped.length === 0) {
        log("⚠️  No jobs passed the language filter — skipping file export.");
      }

      job.status = "done";
      job.result = {
        totalScraped,
        passed: scraped.length,
        file: outputFile,
      };
      broadcast(job, { type: "done", ...job.result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.status = "error";
      job.error = msg;
      broadcast(job, { type: "error", message: msg });
    }
  })();
});

// ── GET /api/download/:filename: serve a generated file ──────────────────────
app.get("/api/download/:filename", (req: Request, res: Response) => {
  const filename = req.params["filename"];

  // Only serve files that were actually generated by a job
  const isKnown = [...jobs.values()].some((j) => j.result?.file === filename);
  if (!isKnown) {
    res.status(403).json({ error: "File not found or not authorised" });
    return;
  }

  const filePath = join(DOWNLOADS_DIR, filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "File not found on disk" });
    return;
  }

  res.download(filePath);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env["PORT"] ?? 3000);
app.listen(PORT, () => {
  console.log(`\n🌐  LinkedIn Scraper UI  →  http://localhost:${PORT}\n`);
});
