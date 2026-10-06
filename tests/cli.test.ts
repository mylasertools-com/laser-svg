import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? -1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("cli check", () => {
  it("exits 0 on a valid file", () => {
    const r = run(["check", join(FIXTURES, "valid.svg")]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Laser SVG Validator");
    expect(r.stdout).toContain("✓ Dimensions valid");
    expect(r.stdout).toContain("✓ ViewBox present");
    expect(r.stdout).toContain("0 warnings");
    expect(r.stdout).toContain("0 errors");
  });

  it("exits 0 with warnings for duplicate-path.svg", () => {
    const r = run(["check", join(FIXTURES, "duplicate-path.svg")]);
    expect(r.code).toBe(0); // warnings alone must not fail
    expect(r.stdout).toContain("DUPLICATE_PATH");
    expect(r.stdout).toContain("3 warnings"); // duplicate + 2 open paths
  });

  it("exits 1 for validation errors", () => {
    const dir = mkdtempSync(join(tmpdir(), "laser-svg-"));
    const file = join(dir, "bad.svg");
    // write via node fs to avoid shell quoting
    writeFileSync(
      file,
      `<svg xmlns="http://www.w3.org/2000/svg" width="0mm" height="10mm"/>`,
    );
    const r = run(["check", file]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("INVALID_DIMENSIONS");
  });

  it("exits 2 for a missing file", () => {
    const r = run(["check", "does-not-exist.svg"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Cannot read");
  });

  it("exits 2 for CLI usage errors", () => {
    expect(run(["bogus-command"]).code).toBe(2);
    expect(run(["check"]).code).toBe(2);
    expect(run([]).code).toBe(2);
  });

  it("exits 0 for --help and --version", () => {
    expect(run(["--help"]).code).toBe(0);
    expect(run(["--version"]).code).toBe(0);
  });

  it("exits 2 for malformed SVG", () => {
    const dir = mkdtempSync(join(tmpdir(), "laser-svg-"));
    const file = join(dir, "broken.svg");
    writeFileSync(file, `<svg><path></svg>`);
    const r = run(["check", file]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Malformed SVG");
  });

  it("--json prints only valid JSON", () => {
    const r = run(["check", join(FIXTURES, "duplicate-path.svg"), "--json"]);
    expect(r.code).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.valid).toBe(true);
    expect(
      report.issues.some((i: { code: string }) => i.code === "DUPLICATE_PATH"),
    ).toBe(true);
    expect(report.elementCount).toBe(2);
    expect(report.pathCount).toBe(2);
  });

  it("--json exits 1 when errors exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "laser-svg-"));
    const file = join(dir, "bad.svg");
    writeFileSync(
      file,
      `<svg xmlns="http://www.w3.org/2000/svg" width="-1mm" height="10mm"/>`,
    );
    const r = run(["check", file, "--json"]);
    expect(r.code).toBe(1);
    const report = JSON.parse(r.stdout);
    expect(report.valid).toBe(false);
  });
});

describe("cli fix", () => {
  it("writes a fixed file with -o and exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "laser-svg-"));
    const out = join(dir, "fixed.svg");
    const r = run(["fix", join(FIXTURES, "duplicate-path.svg"), "-o", out]);
    expect(r.code).toBe(0);

    const fixed = readFileSync(out, "utf8");
    expect(fixed).toContain('id="path17"');
    expect(fixed).not.toContain('id="path42"');

    // the fixed file must now check clean
    const check = run(["check", out]);
    expect(check.code).toBe(0);
    expect(check.stdout).not.toContain("DUPLICATE_PATH");
  });

  it("supports --remove-hidden", () => {
    const dir = mkdtempSync(join(tmpdir(), "laser-svg-"));
    const out = join(dir, "fixed.svg");
    const r = run([
      "fix",
      join(FIXTURES, "hidden-elements.svg"),
      "-o",
      out,
      "--remove-hidden",
    ]);
    expect(r.code).toBe(0);
    const fixed = readFileSync(out, "utf8");
    expect(fixed).not.toContain('id="gone"');
    expect(fixed).toContain('id="visible"');
  });

  it("exits 2 for malformed input", () => {
    const dir = mkdtempSync(join(tmpdir(), "laser-svg-"));
    const file = join(dir, "broken.svg");
    writeFileSync(file, `not xml at all <<<`);
    const r = run(["fix", file, "-o", join(dir, "out.svg")]);
    expect(r.code).toBe(2);
  });
});
