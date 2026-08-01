import syntheticBank from "../fixtures/public-synthetic-bank.json";
import {
  ContentBankSchema,
  validateContentBank,
} from "../../scripts/protected-content.schema";
import {
  convertProtectedBlueprint,
  parseQuestionBlock,
} from "../../scripts/convert-protected-blueprint";
import { assertImportConfiguration } from "../../scripts/import-protected-content";

describe("protected content schema", () => {
  it("accepts exactly three synthetic items for every C1-C8 concept", () => {
    const bank = validateContentBank(syntheticBank, { production: false });

    expect(bank.items).toHaveLength(24);
    expect(
      Object.fromEntries(
        Array.from({ length: 8 }, (_, index) => {
          const conceptId = `C${index + 1}`;
          return [
            conceptId,
            bank.items.filter((item) => item.conceptId === conceptId).length,
          ];
        }),
      ),
    ).toEqual({
      C1: 3,
      C2: 3,
      C3: 3,
      C4: 3,
      C5: 3,
      C6: 3,
      C7: 3,
      C8: 3,
    });
  });

  it("rejects a bank with missing concept coverage", () => {
    expect(() =>
      validateContentBank(
        {
          ...syntheticBank,
          items: syntheticBank.items.slice(0, 23),
        },
        { production: false },
      ),
    ).toThrow(/exactly 24 items/i);
  });

  it("rejects synthetic source references in production mode", () => {
    expect(() =>
      validateContentBank(syntheticBank, { production: true }),
    ).toThrow(/protected source references/i);
  });

  it("rejects answer IDs that are absent from the options", () => {
    const parsed = ContentBankSchema.parse(syntheticBank);
    const firstItem = parsed.items[0];
    if (!firstItem || firstItem.interaction.kind !== "single-choice") {
      throw new Error("Fixture shape changed unexpectedly.");
    }

    expect(() =>
      validateContentBank(
        {
          ...parsed,
          items: [
            {
              ...firstItem,
              interaction: {
                ...firstItem.interaction,
                correctOptionIds: ["Z"],
              },
            },
            ...parsed.items.slice(1),
          ],
        },
        { production: false },
      ),
    ).toThrow(/correct option/i);
  });
});

describe("protected blueprint conversion", () => {
  it("parses a type-specific classification item without flattening it", () => {
    const item = parseQuestionBlock(`
#### C4-Q2: Synthetic zone matching

**Type:** Tap-to-classify
**Source:** ICT PDF, pages 30-34
**Stem:** Match each invented object with its coloured zone.
**Pairs:**

- Violet kite → Violet zone
- Green kite → Green zone

**Correct answer:** All pairs as shown
**Rationale:** The synthetic fixture explicitly pairs each kite and zone.
**Primary misconception:** \`C4-M2\`
`);

    expect(item.interaction).toEqual({
      kind: "classification",
      prompts: [
        { id: "A", text: "Violet kite" },
        { id: "B", text: "Green kite" },
      ],
      categories: ["Violet zone", "Green zone"],
      correctCategoryByPrompt: {
        A: "Violet zone",
        B: "Green zone",
      },
    });
  });

  it("keeps a single-select classification question as single-choice", () => {
    const item = parseQuestionBlock(`
#### C7-Q1: Synthetic classification decision

**Type:** Single-select classification
**Source:** 21QL PDF, pages 38-39
**Stem:** Which label correctly classifies the invented sample event?
**Options:**

A. First label
B. Second label
C. Third label

**Correct answer:** A
**Rationale:** The public fixture explicitly marks the first label as correct.
**Primary misconception:** \`C7-M1\`
`);

    expect(item.interaction).toMatchObject({
      kind: "single-choice",
      correctOptionIds: ["A"],
    });
  });

  it("converts a complete synthetic 24-item blueprint", () => {
    const markdown = Array.from({ length: 24 }, (_, index) => {
      const concept = Math.floor(index / 3) + 1;
      const question = (index % 3) + 1;
      return `
#### C${concept}-Q${question}: Synthetic item ${index + 1}

**Type:** Single-select scenario
**Source:** ICT PDF, page ${index + 1}
**Stem:** Which synthetic option is marked correct for item ${index + 1}?
**Options:**

A. Marked option
B. Alternate option
C. Third option

**Correct answer:** A
**Rationale:** The fixture marks option A so conversion can be tested safely.
**Primary misconception:** \`C${concept}-M1\`
`;
    }).join("\n");

    const bank = convertProtectedBlueprint(markdown);

    expect(bank.items).toHaveLength(24);
    expect(bank.items.at(-1)?.id).toBe("C8-Q3");
  });
});

describe("protected import safeguards", () => {
  it("accepts the loopback Supabase URL for local verification", () => {
    expect(
      assertImportConfiguration({
        supabaseUrl: "http://127.0.0.1:54321",
        serviceRoleKey: "synthetic-local-service-role-key",
      }),
    ).toBe("local");
  });

  it("requires a service-role key", () => {
    expect(() =>
      assertImportConfiguration({
        supabaseUrl: "https://test-project.supabase.co",
        serviceRoleKey: "",
      }),
    ).toThrow(/service-role key/i);
  });

  it("requires exact confirmation before targeting any hosted project", () => {
    expect(() =>
      assertImportConfiguration({
        supabaseUrl: "https://staging-project.supabase.co",
        serviceRoleKey: "synthetic-service-role-key",
      }),
    ).toThrow(/confirm-project-ref=staging-project/i);

    expect(() =>
      assertImportConfiguration({
        supabaseUrl: "https://staging-project.supabase.co",
        serviceRoleKey: "synthetic-service-role-key",
        confirmedProjectRef: "different-project",
      }),
    ).toThrow(/confirm-project-ref=staging-project/i);

    expect(() =>
      assertImportConfiguration({
        supabaseUrl: "https://live-project.supabase.co",
        serviceRoleKey: "synthetic-service-role-key",
        confirmedProjectRef: "live-project",
      }),
    ).not.toThrow();
  });
});
