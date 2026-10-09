import cleanup from "../examples/cleanup.svg";
import missing from "../examples/missing-viewbox.svg";
import near from "../examples/near-duplicates.svg";
import text from "../examples/live-text.svg";
import clean from "../examples/clean.svg";

const samples = {
  cleanup: {
    svg: cleanup,
    note: "Exact duplicates and empty paths can be removed. The drawing should look the same.",
  },
  "missing-viewbox": {
    svg: missing,
    note: "Adding a viewBox preserves the original CSS-pixel coordinate system, even when the viewport is in millimetres.",
  },
  "near-duplicates": {
    svg: near,
    note: "These outlines differ by 0.008 user units. Near duplicates are reported, never removed automatically.",
  },
  "live-text": {
    svg: text,
    note: "Outline text in your design tool. Open paths may be intentional engraving strokes; inspect them before cutting.",
  },
  clean: {
    svg: clean,
    note: "No issues detected by these rules. Check your material, kerf and machine settings separately.",
  },
};
const $ = (id) => document.getElementById(id);
const source = $("source");
const LIMIT = 1024 * 1024;
let worker,
  timer,
  timeout,
  data,
  applied = false,
  fixedView = false,
  request = 0,
  previewUrl;
const originalLabel = "ORIGINAL ARTWORK";

function clearResult() {
  data = undefined;
  applied = false;
  fixedView = false;
  $("output").value = "";
  for (const id of ["apply", "download", "report-download", "view-fixed"])
    $(id).disabled = true;
  $("view-original").setAttribute("aria-pressed", "true");
  $("view-fixed").setAttribute("aria-pressed", "false");
  $("fixes-section").hidden = true;
  $("error").hidden = true;
  $("issues").replaceChildren();
  for (const id of ["path-count", "issue-count", "fix-count"])
    $(id).textContent = "—";
  $("fix-count-label").textContent = "available fixes";
  $("dimensions").textContent = "—";
  $("view-label").textContent = originalLabel;
  $("preview").hidden = true;
  $("preview-error").hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
}

function fail(message) {
  clearTimeout(timeout);
  worker?.terminate();
  clearResult();
  $("summary").textContent = "Unable to inspect this SVG";
  $("error").textContent = message;
  $("error").hidden = false;
}

function inspect() {
  clearTimeout(timer);
  clearTimeout(timeout);
  worker?.terminate();
  clearResult();
  const id = ++request;
  const svg = source.value;
  const duplicateTolerance = Number($("tolerance").value);
  if (!svg.trim()) return fail("Paste an SVG or choose an example to begin.");
  if (new Blob([svg]).size > LIMIT)
    return fail(
      "Please use an SVG smaller than 1 MB in this workbench. The CLI is available for larger files.",
    );
  if (
    $("tolerance").value === "" ||
    !Number.isFinite(duplicateTolerance) ||
    duplicateTolerance < 0
  )
    return fail("Enter a finite near-duplicate tolerance of 0 or greater.");
  $("summary").textContent = "Inspecting SVG…";
  timer = setTimeout(() => {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    timeout = setTimeout(
      () =>
        fail(
          "This SVG took too long to inspect. Simplify it or run the CLI locally.",
        ),
      5000,
    );
    worker.onerror = () =>
      fail(
        "The inspection worker could not start. Reload the page and try again.",
      );
    worker.onmessage = (event) => {
      if (id !== request) return;
      clearTimeout(timeout);
      worker.terminate();
      if (event.data.error) return fail(event.data.error);
      data = { ...event.data, original: svg };
      $("apply").disabled = false;
      $("report-download").disabled = false;
      render();
    };
    worker.postMessage({
      svg,
      options: { duplicateTolerance, removeHidden: $("remove-hidden").checked },
    });
  }, 180);
}

function render() {
  const report = fixedView ? data.after : data.before;
  const svg = fixedView ? data.result.svg : data.original;
  $("view-original").setAttribute("aria-pressed", String(!fixedView));
  $("view-fixed").setAttribute("aria-pressed", String(fixedView));
  $("view-label").textContent = fixedView ? "FIXED ARTWORK" : originalLabel;
  $("preview").alt = fixedView ? "Fixed SVG artwork" : "Original SVG artwork";
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  // SVGs render in an image context: never inject uploaded markup into the DOM.
  $("preview").src = previewUrl;
  $("preview").hidden = false;
  $("preview-error").hidden = true;
  $("path-count").textContent = report.pathCount;
  $("issue-count").textContent = report.issues.length;
  $("fix-count").textContent = data.result.fixes.length;
  $("fix-count-label").textContent = applied
    ? "fixes applied"
    : "available fixes";
  $("dimensions").textContent =
    report.width && report.height
      ? `${report.width} × ${report.height} ${report.units ?? "(units vary or are unspecified)"}`
      : "Dimensions unspecified";
  const errors = report.issues.filter((i) => i.severity === "error").length;
  const warnings = report.issues.filter((i) => i.severity === "warning").length;
  $("summary").textContent =
    `${errors} errors · ${warnings} warnings · ${report.issues.length - errors - warnings} info${fixedView ? " remaining" : ""}`;
  $("issues").replaceChildren();
  if (!report.issues.length) {
    const empty = document.createElement("div");
    empty.className = "empty-report";
    empty.textContent = "✓ No issues detected by the current rules.";
    $("issues").append(empty);
  }
  for (const issue of report.issues) {
    const card = document.createElement("article");
    card.className = `issue ${issue.severity}`;
    const top = document.createElement("div");
    top.className = "issue-top";
    const code = document.createElement("code");
    code.textContent = issue.code;
    const severity = document.createElement("span");
    severity.className = "severity";
    severity.textContent = issue.severity;
    const message = document.createElement("p");
    message.textContent = issue.message;
    const fix = document.createElement("small");
    fix.textContent = issue.fixable
      ? issue.code === "HIDDEN_ELEMENT"
        ? "Optional · enable removal to fix"
        : "Automatic fix available"
      : "Inspect manually";
    top.append(code, severity);
    card.append(top, message, fix);
    $("issues").append(card);
  }
  $("apply").textContent = data.result.fixes.length
    ? `Apply ${data.result.fixes.length} fixes ↗`
    : "Show unchanged result ↗";
  $("apply").disabled = applied;
}

function sample(name) {
  source.value = samples[name].svg;
  $("filename").textContent = `${name}.svg`;
  $("example-note").textContent = samples[name].note;
  for (const button of document.querySelectorAll("[data-example]")) {
    const active = button.dataset.example === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  inspect();
}

function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const button of document.querySelectorAll("[data-example]"))
  button.addEventListener("click", () => sample(button.dataset.example));
source.addEventListener("input", () => {
  for (const button of document.querySelectorAll("[data-example]")) {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  }
  $("example-note").textContent =
    "Custom SVG. Review the report and output before using the file in your laser software.";
  inspect();
});
$("remove-hidden").addEventListener("change", inspect);
$("tolerance").addEventListener("input", inspect);
$("apply").addEventListener("click", () => {
  if (!data) return;
  applied = true;
  fixedView = true;
  $("view-fixed").disabled = false;
  $("download").disabled = false;
  $("output").value = data.result.svg;
  $("fixes").replaceChildren();
  for (const fix of data.result.fixes) {
    const item = document.createElement("li");
    item.textContent = fix.code;
    $("fixes").append(item);
  }
  $("fixes-section").hidden = !data.result.fixes.length;
  render();
});
$("view-original").addEventListener("click", () => {
  if (data) {
    fixedView = false;
    render();
  }
});
$("view-fixed").addEventListener("click", () => {
  if (data && applied) {
    fixedView = true;
    render();
  }
});
$("download").addEventListener("click", () => {
  if (data && applied)
    download(
      data.result.svg,
      "image/svg+xml",
      $("filename").textContent.replace(/\.svg$/i, "") + ".fixed.svg",
    );
});
$("report-download").addEventListener("click", () => {
  if (data)
    download(
      JSON.stringify(
        {
          before: data.before,
          after: data.after,
          fixes: data.result.fixes,
          applied,
        },
        null,
        2,
      ),
      "application/json",
      "laser-svg-report.json",
    );
});
$("file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  clearTimeout(timer);
  clearTimeout(timeout);
  worker?.terminate();
  ++request;
  if (file.size > LIMIT) {
    event.target.value = "";
    return fail("Please choose an SVG smaller than 1 MB.");
  }
  const readRequest = request;
  try {
    const value = await file.text();
    if (readRequest !== request) return;
    source.value = value;
    $("filename").textContent = file.name;
    source.dispatchEvent(new Event("input"));
  } catch {
    fail("This file could not be read. Please try again.");
  }
  event.target.value = "";
});
$("preview").addEventListener("error", () => {
  $("preview-error").hidden = false;
  $("preview").hidden = true;
});
sample("cleanup");
