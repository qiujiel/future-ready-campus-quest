import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type ContentBank,
  type ProtectedItem,
  ProtectedItemSchema,
  validateContentBank,
} from "./protected-content.schema.ts";

const FORM_BY_ITEM_ID: Record<string, ProtectedItem["form"]> = {
  "C1-Q1": "diagnostic",
  "C1-Q2": "practice",
  "C1-Q3": "final",
  "C2-Q3": "diagnostic",
  "C2-Q1": "practice",
  "C2-Q2": "final",
  "C3-Q1": "diagnostic",
  "C3-Q2": "practice",
  "C3-Q3": "final",
  "C4-Q1": "diagnostic",
  "C4-Q2": "practice",
  "C4-Q3": "final",
  "C5-Q1": "diagnostic",
  "C5-Q2": "practice",
  "C5-Q3": "final",
  "C6-Q1": "diagnostic",
  "C6-Q3": "practice",
  "C6-Q2": "final",
  "C7-Q1": "diagnostic",
  "C7-Q2": "practice",
  "C7-Q3": "final",
  "C8-Q1": "diagnostic",
  "C8-Q3": "practice",
  "C8-Q2": "final",
};

function inlineField(block: string, labelPattern: string): string {
  const match = block.match(
    new RegExp(`\\*\\*${labelPattern}:\\*\\*\\s*([^\\n]+)`, "i"),
  );
  if (!match?.[1]) {
    throw new Error(`Missing protected blueprint field: ${labelPattern}`);
  }
  return match[1].trim();
}

function section(block: string, labelPattern: string): string {
  const match = block.match(
    new RegExp(
      `\\*\\*${labelPattern}:\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*[^\\n]+:\\*\\*|\\n####|$)`,
      "i",
    ),
  );
  if (!match?.[1]) {
    throw new Error(`Missing protected blueprint section: ${labelPattern}`);
  }
  return match[1].trim();
}

function letteredOptions(value: string): Array<{ id: string; text: string }> {
  const options = Array.from(
    value.matchAll(/^([A-Z])\.\s+(.+)$/gm),
    ([, id, text]) => ({ id: id ?? "", text: text?.trim() ?? "" }),
  );
  if (options.length < 3) {
    throw new Error("Select items require at least three lettered options.");
  }
  return options;
}

function bulletItems(value: string): string[] {
  return Array.from(
    value.matchAll(/^-\s+(.+)$/gm),
    ([, text]) => text?.trim() ?? "",
  ).filter(Boolean);
}

function normalizedTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .map((token) =>
      token
        .replace(/ment$/, "")
        .replace(/ing$/, "")
        .replace(/ed$/, ""),
    );
}

function matchOrder(
  options: Array<{ id: string; text: string }>,
  labels: string[],
): string[] {
  const unused = new Set(options.map(({ id }) => id));
  return labels.map((label) => {
    const labelTokens = new Set(normalizedTokens(label));
    const ranked = options
      .filter(({ id }) => unused.has(id))
      .map((option) => ({
        id: option.id,
        score: normalizedTokens(option.text).filter((token) =>
          labelTokens.has(token),
        ).length,
      }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best || best.score === 0) {
      throw new Error(`Could not map ordering answer label: ${label}`);
    }
    unused.delete(best.id);
    return best.id;
  });
}

function sourceReference(block: string): ProtectedItem["sourceRefs"][number] {
  const source = inlineField(block, "Source");
  const pages = source.match(/pages?\s+(\d+)(?:-(\d+))?/i);
  if (!pages?.[1]) throw new Error(`Invalid source page reference: ${source}`);
  const pageStart = Number(pages[1]);
  const pageEnd = pages[2] ? Number(pages[2]) : undefined;
  return {
    document: /21QL/i.test(source) ? "quality-learning" : "overview-ict",
    pageStart,
    ...(pageEnd ? { pageEnd } : {}),
  };
}

function parseInteraction(
  block: string,
  type: string,
): ProtectedItem["interaction"] {
  if (/^(?:tap-to-classify|classification)$/i.test(type.trim())) {
    const pairSection = /\*\*Pairs:\*\*/i.test(block)
      ? section(block, "Pairs")
      : section(block, "Items and answers");
    const pairs = bulletItems(pairSection).map((line) => {
      const [prompt, category] = line.split(/\s*→\s*/, 2);
      if (!prompt || !category) {
        throw new Error(`Invalid classification pair: ${line}`);
      }
      return { prompt, category };
    });
    const prompts = pairs.map(({ prompt }, index) => ({
      id: String.fromCharCode(65 + index),
      text: prompt,
    }));
    return {
      kind: "classification",
      prompts,
      categories: [...new Set(pairs.map(({ category }) => category))],
      correctCategoryByPrompt: Object.fromEntries(
        pairs.map(({ category }, index) => [
          String.fromCharCode(65 + index),
          category,
        ]),
      ),
    };
  }

  if (/ordering/i.test(type)) {
    const options = bulletItems(section(block, "Items")).map((text, index) => ({
      id: String.fromCharCode(65 + index),
      text,
    }));
    const labels = inlineField(block, "Correct order").split(/\s*→\s*/);
    return {
      kind: "scenario-sort",
      options,
      correctOrderIds: matchOrder(options, labels),
    };
  }

  const options = letteredOptions(section(block, "Options"));
  const answer = inlineField(block, "Correct answers?");
  const correctOptionIds = Array.from(
    answer.matchAll(/\b([A-Z])\b/g),
    ([, id]) => id ?? "",
  );
  return {
    kind: /multi-select/i.test(type) ? "multi-select" : "single-choice",
    options,
    correctOptionIds,
  };
}

export function parseQuestionBlock(block: string): ProtectedItem {
  const heading = block.match(
    /^####\s+(C[1-8]-Q[1-3]):\s+(.+)$/m,
  );
  if (!heading?.[1]) throw new Error("Invalid protected question heading.");
  const id = heading[1];
  const type = inlineField(block, "Type");
  const misconceptionLine = inlineField(
    block,
    "Primary misconceptions?",
  );
  const misconceptionTags = Array.from(
    misconceptionLine.matchAll(/`(C[1-8]-M[1-4])`/g),
    ([, tag]) => tag ?? "",
  );

  return ProtectedItemSchema.parse({
    id,
    conceptId: id.slice(0, 2),
    form: FORM_BY_ITEM_ID[id] ?? "practice",
    stem: inlineField(block, "Stem"),
    interaction: parseInteraction(block, type),
    rationale: inlineField(block, "Rationale"),
    misconceptionTags,
    sourceRefs: [sourceReference(block)],
  });
}

export function convertProtectedBlueprint(markdown: string): ContentBank {
  const blocks = markdown
    .split(/(?=^####\s+C[1-8]-Q[1-3]:)/gm)
    .filter((block) => /^####\s+C[1-8]-Q[1-3]:/m.test(block));
  const items = blocks.map(parseQuestionBlock);
  return validateContentBank(
    {
      version: "2026-07-30-approved-blueprint-v1",
      items,
    },
    { production: true },
  );
}

async function main(): Promise<void> {
  const sourcePath = resolve(
    process.argv[2] ??
      "protected-content/2026-07-30-future-ready-campus-quest-content-assessment-blueprint.md",
  );
  const outputPath = resolve(
    process.argv[3] ?? "protected-content/generated/question-bank.json",
  );
  const bank = convertProtectedBlueprint(await readFile(sourcePath, "utf8"));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bank, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      outputPath,
      itemIds: bank.items.map(({ id }) => id),
      itemCount: bank.items.length,
      conceptCount: new Set(bank.items.map(({ conceptId }) => conceptId)).size,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
