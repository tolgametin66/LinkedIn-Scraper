import ExcelJS from "exceljs";
type Column = ExcelJS.Column;
import { writeFileSync } from "fs";
import type { JobData, RunInfo } from "./types.js";

// ─── Shared column definitions ──────────────────────────────────────────────

const JOB_COLUMNS: Partial<Column>[] = [
  { header: "Title", key: "title", width: 35 },
  { header: "Company", key: "company", width: 28 },
  { header: "Location", key: "location", width: 28 },
  { header: "Date Posted", key: "datePosted", width: 18 },
  { header: "Job Type", key: "jobType", width: 16 },
  { header: "Salary", key: "salary", width: 22 },
  { header: "Detected Language", key: "detectedLanguage", width: 20 },
  { header: "Job URL", key: "jobUrl", width: 55 },
  { header: "Company URL", key: "companyUrl", width: 45 },
  { header: "Description Preview", key: "descriptionPreview", width: 65 },
];

// ─── Excel export ────────────────────────────────────────────────────────────

export async function exportToExcel(
  jobs: JobData[],
  runInfo: RunInfo,
  outputPath: string
): Promise<string> {
  const filePath = outputPath.endsWith(".xlsx")
    ? outputPath
    : `${outputPath}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "linkedin-scraper-mcp";
  workbook.created = new Date();

  // ── Sheet 1: LinkedIn Jobs ──────────────────────────────────────────────
  const sheet = workbook.addWorksheet("LinkedIn Jobs");
  sheet.columns = JOB_COLUMNS;

  // Style header row: LinkedIn blue bg, white bold text
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0077B5" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF005E8A" } },
    };
  });
  headerRow.height = 22;

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 1, topLeftCell: "A2" }];

  // Add data rows
  for (const job of jobs) {
    const row = sheet.addRow({
      title: job.title,
      company: job.company,
      location: job.location,
      datePosted: job.datePosted,
      jobType: job.jobType,
      salary: job.salary,
      detectedLanguage: job.detectedLanguage,
      jobUrl: job.jobUrl,
      companyUrl: job.companyUrl,
      descriptionPreview: job.descriptionPreview,
    });
    row.alignment = { wrapText: false, vertical: "top" };
  }

  // Auto-size columns (cap at 80 chars wide)
  sheet.columns.forEach((col) => {
    let maxLen = col.header ? String(col.header).length : 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 2, 10), 80);
  });

  // ── Sheet 2: Run Info ───────────────────────────────────────────────────
  const infoSheet = workbook.addWorksheet("Run Info");
  infoSheet.columns = [
    { header: "Field", key: "field", width: 30 },
    { header: "Value", key: "value", width: 55 },
  ] as Partial<Column>[];

  // Style info header
  infoSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0077B5" },
    };
  });

  const infoRows: Array<{ field: string; value: string }> = [
    { field: "Query", value: runInfo.query },
    { field: "Location", value: runInfo.location ?? "Any" },
    { field: "Date Since Posted", value: runInfo.filters.dateSincePosted ?? "Any" },
    { field: "Experience Level", value: runInfo.filters.experienceLevel ?? "Any" },
    { field: "Job Type", value: runInfo.filters.jobType ?? "Any" },
    { field: "Remote Filter", value: runInfo.filters.remoteFilter ?? "Any" },
    { field: "Allowed Languages (ISO 639-3)", value: runInfo.filters.allowedLanguages ?? "eng" },
    { field: "Total Scraped", value: String(runInfo.totalScraped) },
    { field: "Passed Language Filter", value: String(runInfo.totalAfterFilter) },
    {
      field: "Filter Retention Rate",
      value:
        runInfo.totalScraped > 0
          ? `${Math.round((runInfo.totalAfterFilter / runInfo.totalScraped) * 100)}%`
          : "N/A",
    },
    { field: "Run Timestamp", value: runInfo.timestamp },
  ];
  infoRows.forEach((r) => infoSheet.addRow(r));

  await workbook.xlsx.writeFile(filePath);
  console.log(`\n💾 Excel file saved: ${filePath}`);
  return filePath;
}

// ─── CSV export ───────────────────────────────────────────────────────────

export async function exportToCSV(
  jobs: JobData[],
  outputPath: string
): Promise<string> {
  const filePath = outputPath.endsWith(".csv")
    ? outputPath
    : `${outputPath}.csv`;

  const headers = JOB_COLUMNS.map((c) => c.header as string);

  function esc(value: unknown): string {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const lines = [
    headers.map(esc).join(","),
    ...jobs.map((job) =>
      [
        job.title,
        job.company,
        job.location,
        job.datePosted,
        job.jobType,
        job.salary,
        job.detectedLanguage,
        job.jobUrl,
        job.companyUrl,
        job.descriptionPreview,
      ]
        .map(esc)
        .join(",")
    ),
  ];

  writeFileSync(filePath, lines.join("\n"), { encoding: "utf-8" });
  console.log(`\n💾 CSV file saved: ${filePath}`);
  return filePath;
}
