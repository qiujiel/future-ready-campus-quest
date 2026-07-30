import { z } from "zod";

export const ConceptIdSchema = z.enum([
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
]);

const OptionSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_-]*$/),
  text: z.string().min(1),
});

const SelectInteractionSchema = z.object({
  kind: z.enum(["single-choice", "multi-select"]),
  options: z.array(OptionSchema).min(3),
  correctOptionIds: z.array(z.string()).min(1),
});

const SortInteractionSchema = z.object({
  kind: z.literal("scenario-sort"),
  options: z.array(OptionSchema).min(3),
  correctOrderIds: z.array(z.string()).min(3),
});

const ClassificationInteractionSchema = z.object({
  kind: z.literal("classification"),
  prompts: z.array(OptionSchema).min(2),
  categories: z.array(z.string().min(1)).min(2),
  correctCategoryByPrompt: z.record(z.string(), z.string()),
});

export const InteractionSchema = z
  .discriminatedUnion("kind", [
    SelectInteractionSchema,
    SortInteractionSchema,
    ClassificationInteractionSchema,
  ])
  .superRefine((interaction, context) => {
    if (
      interaction.kind === "single-choice" ||
      interaction.kind === "multi-select"
    ) {
      const optionIds = new Set(interaction.options.map(({ id }) => id));
      if (interaction.correctOptionIds.some((id) => !optionIds.has(id))) {
        context.addIssue({
          code: "custom",
          message: "Every correct option must exist in the item's options.",
        });
      }
      if (
        interaction.kind === "single-choice" &&
        interaction.correctOptionIds.length !== 1
      ) {
        context.addIssue({
          code: "custom",
          message: "A single-choice item must have one correct option.",
        });
      }
      return;
    }

    if (interaction.kind === "scenario-sort") {
      const optionIds = interaction.options.map(({ id }) => id);
      if (
        new Set(interaction.correctOrderIds).size !== optionIds.length ||
        interaction.correctOrderIds.some((id) => !optionIds.includes(id))
      ) {
        context.addIssue({
          code: "custom",
          message: "The correct order must contain every option exactly once.",
        });
      }
      return;
    }

    if (interaction.kind !== "classification") return;

    const promptIds = interaction.prompts.map(({ id }) => id);
    const mappedIds = Object.keys(interaction.correctCategoryByPrompt);
    const mappedCategories = Object.values(
      interaction.correctCategoryByPrompt,
    );
    if (
      mappedIds.length !== promptIds.length ||
      promptIds.some((id) => !(id in interaction.correctCategoryByPrompt)) ||
      mappedCategories.some(
        (category) => !interaction.categories.includes(category),
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Every classification prompt must map to one listed category.",
      });
    }
  });

export const ProtectedItemSchema = z.object({
  id: z.string().regex(/^C[1-8]-Q[1-3]$/),
  conceptId: ConceptIdSchema,
  form: z.enum(["diagnostic", "practice", "final"]),
  stem: z.string().min(20),
  interaction: InteractionSchema,
  rationale: z.string().min(20),
  misconceptionTags: z
    .array(z.string().regex(/^C[1-8]-M[1-4]$/))
    .min(1),
  sourceRefs: z
    .array(
      z.object({
        document: z.enum([
          "overview-ict",
          "quality-learning",
          "public-synthetic",
        ]),
        pageStart: z.number().int().positive(),
        pageEnd: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});

export const ContentBankSchema = z.object({
  version: z.string().min(3),
  items: z.array(ProtectedItemSchema),
});

export type ProtectedItem = z.infer<typeof ProtectedItemSchema>;
export type ContentBank = z.infer<typeof ContentBankSchema>;

export function validateContentBank(
  input: unknown,
  options: { production: boolean },
): ContentBank {
  const bank = ContentBankSchema.parse(input);
  if (bank.items.length !== 24) {
    throw new Error("A complete content bank must contain exactly 24 items.");
  }

  const itemIds = new Set<string>();
  for (const item of bank.items) {
    if (itemIds.has(item.id)) {
      throw new Error(`Duplicate protected item ID: ${item.id}`);
    }
    itemIds.add(item.id);

    if (!item.id.startsWith(`${item.conceptId}-`)) {
      throw new Error(`Item ${item.id} does not match its concept ID.`);
    }
    if (
      item.misconceptionTags.some(
        (tag) => !tag.startsWith(`${item.conceptId}-`),
      )
    ) {
      throw new Error(`Item ${item.id} has a cross-concept misconception tag.`);
    }
  }

  for (const conceptId of ConceptIdSchema.options) {
    const count = bank.items.filter(
      (item) => item.conceptId === conceptId,
    ).length;
    if (count !== 3) {
      throw new Error(
        `Content bank must contain three items for ${conceptId}; found ${count}.`,
      );
    }
  }

  if (
    options.production &&
    bank.items.some((item) =>
      item.sourceRefs.some(
        ({ document }) => document === "public-synthetic",
      ),
    )
  ) {
    throw new Error(
      "Production items must use protected source references, not public synthetic references.",
    );
  }

  return bank;
}
