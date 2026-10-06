#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";

import { analyzeSvg } from "../validator/analyzeSvg.ts";
import { fixSvg } from "../fixer/fixSvg.ts";
import { SvgParseError } from "../types.ts";
import type { LaserSvgIssue, LaserSvgReport } from "../types.ts";

const EXIT_OK = 0;
const EXIT_VALIDATION_ERRORS = 1;
const EXIT_FAILURE = 2;

function fail(message: string): never {
  process.stderr.write(`laser-svg: ${message}\n`);
  process.exit(EXIT_FAILURE);
}

/** Commander parser for --duplicate-tolerance; invalid values exit 2. */
function parseToleranceOption(value: string): number {
  if (!/^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value.trim())) {
    fail(`--duplicate-tolerance expects a number >= 0 (got "${value}").`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    fail(`--duplicate-tolerance expects a number >= 0 (got "${value}").`);
  }
  return parsed;
}

function readSource(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    fail(
      `Cannot read "${file}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Run an analysis/fix step, mapping parse failures to exit code 2. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof SvgParseError) fail(err.message);
    throw err;
  }
}

const program = new Command();

program
  .name("laser-svg")
  .description("Validate and fix SVG files for laser cutting.")
  .version("0.1.0")
  .exitOverride();

program
  .command("check")
  .description("Check an SVG file for laser-cutting problems.")
  .argument("<file>", "path to the SVG file")
  .option(
    "--duplicate-tolerance <value>",
    "coordinate tolerance in user units for near-duplicate detection (0 disables fuzzy matching)",
    parseToleranceOption,
  )
  .option("--json", "output the report as JSON")
  .action(
    (file: string, opts: { json?: boolean; duplicateTolerance?: number }) => {
      const source = readSource(file);
      const analyzeOptions =
        opts.duplicateTolerance === undefined
          ? {}
          : { duplicateTolerance: opts.duplicateTolerance };
      const report = guard(() => analyzeSvg(source, analyzeOptions));

      if (opts.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        process.stdout.write(renderHumanReport(file, report));
      }
      process.exit(report.valid ? EXIT_OK : EXIT_VALIDATION_ERRORS);
    },
  );

program
  .command("fix")
  .description("Apply safe fixes to an SVG file.")
  .argument("<file>", "path to the SVG file")
  .option("-o, --output <file>", "write the fixed SVG to this path")
  .option("--remove-hidden", "also remove hidden elements")
  .option("--json", "output the fix result as JSON")
  .action(
    (
      file: string,
      opts: { output?: string; removeHidden?: boolean; json?: boolean },
    ) => {
      const source = readSource(file);
      const result = guard(() =>
        fixSvg(source, { removeHidden: !!opts.removeHidden }),
      );

      const outPath = opts.output ?? file;
      try {
        writeFileSync(outPath, result.svg, "utf8");
      } catch (err) {
        fail(
          `Cannot write "${outPath}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(renderFixReport(file, outPath, result));
      }
      process.exit(EXIT_OK);
    },
  );

/* ------------------------------------------------------------------ */
/* Human-readable rendering                                            */
/* ------------------------------------------------------------------ */

function renderHumanReport(file: string, report: LaserSvgReport): string {
  const lines: string[] = [];
  lines.push("Laser SVG Validator", "");
  lines.push(`File: ${basename(file)}`);

  if (report.width !== undefined && report.height !== undefined) {
    const unit = report.units ? ` ${report.units}` : "";
    lines.push(`Size: ${report.width} × ${report.height}${unit}`);
  } else {
    lines.push("Size: unknown");
  }
  lines.push("");

  for (const check of checksThatPassed(report)) {
    lines.push(`✓ ${check}`);
  }

  for (const severity of ["error", "warning", "info"] as const) {
    const group = report.issues.filter((i) => i.severity === severity);
    if (group.length === 0) continue;
    lines.push("");
    lines.push(`${severity[0]!.toUpperCase()}${severity.slice(1)}s:`);
    for (const issue of group) {
      lines.push(`  ${issue.code}`);
      lines.push(`    ${issue.message}`);
      lines.push("");
    }
  }

  const counts = countBySeverity(report.issues);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  lines.push("");
  lines.push("Summary:");
  lines.push(`  ${counts.warning} warning${counts.warning === 1 ? "" : "s"}`);
  lines.push(`  ${counts.error} error${counts.error === 1 ? "" : "s"}`);
  if (counts.info > 0) {
    lines.push(`  ${counts.info} info`);
  }
  lines.push("");
  return lines.join("\n");
}

function checksThatPassed(report: LaserSvgReport): string[] {
  const codes = new Set(report.issues.map((i) => i.code));
  const checks: string[] = [];
  if (!codes.has("INVALID_DIMENSIONS")) checks.push("Dimensions valid");
  if (!codes.has("MISSING_VIEWBOX")) checks.push("ViewBox present");
  if (!codes.has("AMBIGUOUS_UNITS")) checks.push("Units explicit");
  return checks;
}

function countBySeverity(issues: LaserSvgIssue[]) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}

function renderFixReport(
  file: string,
  outPath: string,
  result: {
    svg: string;
    fixes: LaserSvgIssue[];
    remainingIssues: LaserSvgIssue[];
  },
): string {
  const lines: string[] = [];
  lines.push("Laser SVG Fixer", "");
  lines.push(`File: ${basename(file)}`);
  lines.push(`Output: ${outPath}`, "");

  if (result.fixes.length === 0) {
    lines.push("No automatic fixes applied.");
  } else {
    lines.push("Fixes applied:");
    for (const fix of result.fixes) {
      lines.push(`  ${fix.code}`);
      lines.push(`    ${fix.message}`);
      lines.push("");
    }
  }

  if (result.remainingIssues.length > 0) {
    lines.push("Remaining issues (manual action needed):");
    for (const issue of result.remainingIssues) {
      lines.push(`  ${issue.code}`);
      lines.push(`    ${issue.message}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

// Bare invocation (no arguments at all) is a usage error, not a help
// request: print usage to stderr and exit 2. Explicit --help exits 0.
if (process.argv.length <= 2) {
  process.stderr.write(`${program.helpInformation()}`);
  process.exit(EXIT_FAILURE);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const e = err as { code?: string; exitCode?: number } | null;
  // --help / --version exit cleanly.
  if (
    e?.code === "commander.helpDisplayed" ||
    e?.code === "commander.help" ||
    e?.code === "commander.version"
  ) {
    process.exit(EXIT_OK);
  }
  // Any other commander failure (unknown command, missing argument) is a
  // CLI usage failure: exit 2, not the validation-error code 1.
  if (typeof e?.code === "string" && e.code.startsWith("commander.")) {
    process.exit(EXIT_FAILURE);
  }
  if (typeof e?.exitCode === "number") process.exit(e.exitCode);
  fail(err instanceof Error ? err.message : String(err));
});
