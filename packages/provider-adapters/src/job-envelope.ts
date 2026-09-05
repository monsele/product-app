/**
 * The complete provider capability envelope for pipeline jobs. Keep this list
 * beside provider contracts so an operator can answer what a job may call
 * without following composition wiring.
 */
export const providerAdapterFamilies = [
  "language-model",
  "illustration",
  "text-to-speech",
  "forced-alignment",
  "document-ingestion",
  "malware-scanning",
] as const;
export type ProviderAdapterFamily = (typeof providerAdapterFamilies)[number];

export const pipelineJobAdapterEnvelopes = {
  "document.validation": ["malware-scanning"],
  "document.validation.cleanup": [],
  "document.ingestion": ["document-ingestion"],
  "project-asset.validation": ["malware-scanning"],
  "project-asset.cleanup": [],
  "project.cleanup": [],
  "illustration.generate": ["illustration"],
  "objectives.generate": ["language-model"],
  "outline.generate": ["language-model"],
  "narration.generate": ["language-model"],
  "narration.transform": ["language-model"],
  "storyboard.generate": ["language-model"],
  "storyboard.scene-regenerate": ["language-model"],
  "grounding.check": ["language-model"],
  "tts.generate": ["text-to-speech", "forced-alignment"],
  // Generic model-call tests and internal operation tooling use these names;
  // production handlers use the explicit job names above.
  "ai.objectives": ["language-model"],
  "ai.outline": ["language-model"],
  "ai.narration": ["language-model"],
  "ai.storyboard": ["language-model"],
  "ai.scene_regeneration": ["language-model"],
  "ai.grounding": ["language-model"],
} as const satisfies Record<string, readonly ProviderAdapterFamily[]>;

export type PipelineJobType = keyof typeof pipelineJobAdapterEnvelopes;

/** Distinct from transport failures: no adapter method has run when thrown. */
export class ProviderEnvelopeViolationError extends Error {
  public readonly code = "PROVIDER_ENVELOPE_VIOLATION";
  public constructor(
    public readonly jobType: string,
    public readonly requestedAdapter: ProviderAdapterFamily,
  ) {
    super(`The ${jobType} job is not permitted to use ${requestedAdapter}.`);
    this.name = "ProviderEnvelopeViolationError";
  }
}

/** An approval cannot be substituted with another configured provider/model. */
export class ApprovedProviderUnavailableError extends Error {
  public readonly code = "APPROVED_PROVIDER_UNAVAILABLE";
  public constructor(input: {
    approvedProvider?: string;
    approvedModel?: string;
    foundProvider: string;
    foundModel?: string;
  }) {
    super(
      `The approved provider/model (${input.approvedProvider ?? "unspecified"}/${input.approvedModel ?? "unspecified"}) is unavailable; configured ${input.foundProvider}/${input.foundModel ?? "unspecified"} cannot be substituted.`,
    );
    this.name = "ApprovedProviderUnavailableError";
  }
}

export type ProviderSelection = {
  contractVersion: "provider-envelope-v1";
  provider: string;
  model: string | null;
  selectionReason: "approved_configuration" | "explicit_job_request";
  approvalReference: string | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
};

export function resolveJobAdapter<
  T extends {
    providerId: string;
    model?: string;
    supportedModels?: readonly string[];
  },
>(input: {
  jobType: string;
  adapterFamily: ProviderAdapterFamily;
  adapter: T;
  approvedProvider?: string;
  approvedModel?: string;
  /** The model requested from adapters that select it per call. */
  executingModel?: string;
  selectionReason?: ProviderSelection["selectionReason"];
  approvalReference?: string;
  estimatedCostUsd?: number;
}): { adapter: T; selection: ProviderSelection } {
  if (
    typeof input.adapter.providerId !== "string" ||
    input.adapter.providerId.trim().length === 0
  )
    throw new ApprovedProviderUnavailableError({
      foundProvider: "unidentified",
      ...(input.adapter.model === undefined
        ? {}
        : { foundModel: input.adapter.model }),
    });
  const allowed = pipelineJobAdapterEnvelopes[input.jobType as PipelineJobType];
  if (allowed === undefined || !allowed.includes(input.adapterFamily as never))
    throw new ProviderEnvelopeViolationError(
      input.jobType,
      input.adapterFamily,
    );
  if (
    (input.approvedProvider !== undefined &&
      input.approvedProvider !== input.adapter.providerId) ||
    (input.approvedModel !== undefined &&
      (input.approvedModel !== (input.executingModel ?? input.adapter.model) ||
        input.adapter.supportedModels?.includes(input.approvedModel) !== true))
  )
    throw new ApprovedProviderUnavailableError({
      ...(input.approvedProvider === undefined
        ? {}
        : { approvedProvider: input.approvedProvider }),
      ...(input.approvedModel === undefined
        ? {}
        : { approvedModel: input.approvedModel }),
      foundProvider: input.adapter.providerId,
      ...((input.executingModel ?? input.adapter.model) === undefined
        ? {}
        : { foundModel: input.executingModel ?? input.adapter.model }),
    });
  return {
    adapter: input.adapter,
    selection: {
      contractVersion: "provider-envelope-v1",
      provider: input.adapter.providerId,
      model: input.adapter.model ?? null,
      selectionReason: input.selectionReason ?? "approved_configuration",
      approvalReference: input.approvalReference ?? null,
      estimatedCostUsd: input.estimatedCostUsd ?? null,
      actualCostUsd: null,
    },
  };
}
