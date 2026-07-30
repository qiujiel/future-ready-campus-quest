import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const javascriptBudgetBytes = 250 * 1024;

const forbiddenMarkers = [
  {
    name: "protected-overview-filename",
    pattern: /dflt-session-1-overview-of-ict-in-the-singapore-education-system-aug-2026\.pdf/i,
  },
  {
    name: "protected-quality-learning-filename",
    pattern: /dfrlt-session-1-21st-century-quality-learning-aug-26\.pdf/i,
  },
  { name: "protected-content-path", pattern: /protected-content/i },
  { name: "service-role-marker", pattern: /service[_-]?role/i },
  {
    name: "synthetic-answer-key",
    pattern: /SYNTHETIC_CORRECT_OPTION_DO_NOT_SHIP/,
  },
];

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function scanBundle(root) {
  const absoluteRoot = resolve(root);
  const violations = [];
  for (const path of await filesUnder(absoluteRoot)) {
    const contents = (await readFile(path)).toString("utf8");
    for (const marker of forbiddenMarkers) {
      if (marker.pattern.test(contents) || marker.pattern.test(basename(path))) {
        violations.push({
          marker: marker.name,
          path: relative(absoluteRoot, path),
        });
      }
      marker.pattern.lastIndex = 0;
    }
  }
  return violations;
}

export async function measureJavaScriptGzip(root) {
  const absoluteRoot = resolve(root);
  const javascript = (await filesUnder(absoluteRoot)).filter((path) =>
    path.endsWith(".js"),
  );
  let gzipBytes = 0;
  for (const path of javascript) {
    gzipBytes += gzipSync(await readFile(path)).byteLength;
  }
  return { fileCount: javascript.length, gzipBytes };
}

async function main() {
  const root = process.argv[2] ?? "dist";
  const violations = await scanBundle(root);
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.marker}: ${violation.path}`);
    }
    process.exitCode = 1;
    return;
  }
  const html = await readFile(join(resolve(root), "index.html"), "utf8");
  if (
    !html.includes('http-equiv="Content-Security-Policy"') ||
    !html.includes("default-src 'self'") ||
    !html.includes('name="referrer" content="no-referrer"')
  ) {
    console.error("security-metadata: index.html");
    process.exitCode = 1;
    return;
  }
  const budget = await measureJavaScriptGzip(root);
  if (budget.gzipBytes > javascriptBudgetBytes) {
    console.error(
      `javascript-budget: ${budget.gzipBytes} compressed bytes exceeds ${javascriptBudgetBytes}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Bundle privacy scan passed: ${root}; JavaScript gzip ${budget.gzipBytes}/${javascriptBudgetBytes} bytes`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
