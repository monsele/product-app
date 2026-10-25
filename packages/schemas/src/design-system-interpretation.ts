import { identifierSchema } from "@avlp/config";
import { z } from "zod";
import {
  customPresentationSchema,
  customDesignRuleReport,
} from "./custom-design.js";
import {
  designSystemDefinitionSchema,
  designSystemRuleSchema,
  designSystemContentHash,
  type DesignSystemDefinition,
} from "./design-systems.js";
import { modelCallProviderApprovalSchema } from "./index.js";

const text = (max: number) => z.string().trim().min(1).max(max);
export const requestDesignSystemInterpretationSchema = z
  .object({
    projectId: identifierSchema,
    expectedRevision: z.number().int().positive(),
    request: text(10000),
    assetIds: z.array(identifierSchema).max(12),
    paidActionConfirmed: z.literal(true),
  })
  .strict()
  .refine(
    (v) => new Set(v.assetIds).size === v.assetIds.length,
    "Choose each import once.",
  );
export const designSystemInterpretationPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    interpretationId: identifierSchema,
  })
  .strict();
export const designSystemInterpretationInputSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    definition: designSystemDefinitionSchema,
    request: text(10000),
    assets: z
      .array(
        z
          .object({
            id: identifierSchema,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(12),
    promptId: z.literal("design-system-interpretation"),
    promptVersion: z.literal("v1"),
    providerApproval: z.lazy(() => modelCallProviderApprovalSchema),
  })
  .strict();
export const designInterpretationSourceSchema = z
  .object({
    id: text(80),
    kind: z.enum(["request", "guide", "tokens", "reference", "logo", "font"]),
    text: z.string().max(100000),
  })
  .strict();
export type DesignInterpretationSource = z.infer<
  typeof designInterpretationSourceSchema
>;
export const designSystemInterpretationOutputSchema = z
  .object({
    philosophy: z.string().trim().max(10000),
    rules: z
      .array(
        z
          .object({
            rule: designSystemRuleSchema,
            sourceId: text(80).nullable(),
            quote: text(1000).nullable(),
          })
          .strict(),
      )
      .max(60),
    presentation: customPresentationSchema.nullable(),
    conflicts: z.array(text(1000)).max(30),
    unsupported: z.array(text(1000)).max(30),
  })
  .strict();
export type DesignSystemInterpretationOutput = z.infer<
  typeof designSystemInterpretationOutputSchema
>;
export const designSystemInterpretationProposalSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    definition: designSystemDefinitionSchema,
    suggestedPresentation: customPresentationSchema.nullable(),
    provenance: z
      .array(
        z
          .object({
            ruleId: text(80),
            origin: z.enum(["supplied", "inferred"]),
            sourceId: text(80).nullable(),
            quote: text(1000).nullable(),
          })
          .strict(),
      )
      .max(100),
    conflicts: z.array(text(1000)).max(100),
    unsupported: z.array(text(1000)).max(100),
    capabilities: z
      .array(
        z
          .object({
            ruleId: text(80),
            status: z.enum(["applied", "advisory", "unsupported"]),
            message: text(2000),
          })
          .strict(),
      )
      .max(101),
  })
  .strict();
export type DesignSystemInterpretationProposal = z.infer<
  typeof designSystemInterpretationProposalSchema
>;

/** Exact controls and all existing rules are authoritative. AI only proposes additions. */
export function buildDesignSystemInterpretationProposal(
  base: DesignSystemDefinition,
  output: DesignSystemInterpretationOutput,
  sources: readonly DesignInterpretationSource[],
): DesignSystemInterpretationProposal {
  const conflicts = [...output.conflicts];
  const rules = [...base.rules];
  const provenance: DesignSystemInterpretationProposal["provenance"] =
    base.rules.map((r) => ({
      ruleId: r.id,
      origin: r.origin,
      sourceId: null,
      quote: null,
    }));
  for (const entry of output.rules) {
    const old = rules.find((r) => r.id === entry.rule.id);
    if (old) {
      if (designSystemContentHash(old) !== designSystemContentHash(entry.rule))
        conflicts.push(
          `Existing rule ${old.id} was preserved. Review the conflicting suggestion manually.`,
        );
      continue;
    }
    const source = sources.find((s) => s.id === entry.sourceId);
    if (
      entry.rule.origin === "supplied" &&
      (!source || !entry.quote || !source.text.includes(entry.quote))
    )
      throw new Error(
        "Supplied rules must quote an exact excerpt from a supplied text source.",
      );
    if (entry.rule.origin === "inferred" && entry.quote !== null)
      throw new Error("Inferred suggestions cannot claim supplied quotations.");
    if (rules.length === 100)
      throw new Error(
        "Too many rules. Reduce the proposal before accepting it.",
      );
    rules.push(entry.rule);
    provenance.push({
      ruleId: entry.rule.id,
      origin: entry.rule.origin,
      sourceId: source?.id ?? null,
      quote: entry.quote,
    });
  }
  if (
    base.schemaVersion === "1.1" &&
    output.presentation &&
    designSystemContentHash(output.presentation) !==
      designSystemContentHash(base.presentation)
  )
    conflicts.push(
      "Existing exact presentation controls were preserved. Change them manually after reviewing the interpretation.",
    );
  // New presentation values are always suggestions. No inferred font is silently selected.
  const definition = designSystemDefinitionSchema.parse({
    ...base,
    philosophy: base.philosophy || output.philosophy,
    rules,
  });
  if (base.philosophy && output.philosophy !== base.philosophy)
    conflicts.push(
      "Your existing philosophy was preserved; the proposed rules are available for review.",
    );
  const reports = customDesignRuleReport(rules);
  return designSystemInterpretationProposalSchema.parse({
    schemaVersion: "1.0",
    definition,
    suggestedPresentation: output.presentation,
    provenance,
    conflicts,
    unsupported: [
      ...output.unsupported,
      ...(base.schemaVersion === "1.0"
        ? [
            "Choose validated fonts and exact presentation controls manually before rendering this system.",
          ]
        : []),
    ],
    capabilities: [
      ...reports.map((r) => ({
        ruleId: r.id,
        status: r.status,
        message:
          r.status === "advisory"
            ? "Advisory guidance for approved planning; exact controls remain authoritative."
            : r.message,
      })),
      ...(base.schemaVersion === "1.1"
        ? [
            {
              ruleId: "exact-presentation",
              status: "applied",
              message:
                "Existing exact fonts, colours, assets, composition and motion controls are preserved.",
            },
          ]
        : []),
    ],
  });
}

export const designSystemInterpretationStatusSchema = z
  .object({
    id: identifierSchema,
    inputRevision: z.number().int().positive(),
    state: z.enum([
      "queued",
      "running",
      "retry_wait",
      "failed",
      "cancelled",
      "succeeded",
    ]),
    stale: z.boolean(),
    acceptedRevision: z.number().int().positive().nullable(),
    errorCode: z.string().nullable(),
    proposal: designSystemInterpretationProposalSchema.nullable(),
  })
  .strict();
export const designSystemInterpretationHistorySchema = z
  .array(
    z.object({
      id: identifierSchema,
      inputRevision: z.number().int().positive(),
    }),
  )
  .max(20);
export const designSystemInterpretationQueuedSchema = z.object({
  id: identifierSchema,
  jobId: identifierSchema,
});
