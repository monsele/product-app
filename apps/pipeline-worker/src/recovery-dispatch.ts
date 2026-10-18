import { Buffer } from "node:buffer";
import { and, eq } from "drizzle-orm";
import {
  authorizeRecoveryCall,
  lessonRecoveryTasks,
  RecoveryAuthorityError,
  type DatabaseClient,
} from "@avlp/database";
import { JobExecutionError } from "@avlp/jobs";
import {
  defaultModelPricing,
  type LanguageModelProvider,
  type ModelPricingTable,
} from "@avlp/provider-adapters";

type Context = {
  ownerUserId: string;
  projectId: string;
  jobId: string;
  attempt: number;
};
export async function recoveryDispatch(
  database: DatabaseClient,
  context: Context,
) {
  const [task] = await database
    .select()
    .from(lessonRecoveryTasks)
    .where(
      and(
        eq(lessonRecoveryTasks.ownerUserId, context.ownerUserId),
        eq(lessonRecoveryTasks.projectId, context.projectId),
        eq(lessonRecoveryTasks.jobId, context.jobId),
      ),
    );
  if (!task) return undefined;
  const maximumCostUsd =
    Math.floor(
      (Number(task.reservedUsd) / Math.max(1, 3 - task.priorAttempts)) *
        1_000_000,
    ) / 1_000_000;
  return {
    maximumCostUsd,
    async authorize(phase: string) {
      try {
        await authorizeRecoveryCall(database, {
          ...context,
          taskId: task.id,
          phase,
          maximumCostUsd,
        });
      } catch (error) {
        if (error instanceof RecoveryAuthorityError)
          throw new JobExecutionError(
            "terminal",
            error.code,
            "Preparation stopped or requires additional allowance.",
          );
        throw error;
      }
    },
  };
}

/** Restrict token output to the reserved per-attempt upper bound. Never retry
 * inside an adapter: the durable job mechanism owns the three-attempt limit. */
export function recoveryLanguageModelProvider(
  provider: LanguageModelProvider,
  dispatch: NonNullable<Awaited<ReturnType<typeof recoveryDispatch>>>,
  pricing?: ModelPricingTable,
): LanguageModelProvider {
  return {
    providerId: provider.providerId,
    ...(provider.supportedModels
      ? { supportedModels: provider.supportedModels }
      : {}),
    async complete(request) {
      const price =
        pricing?.[request.model] ?? defaultModelPricing[request.model];
      if (!price)
        throw new JobExecutionError(
          "terminal",
          "RECOVERY_PRICE_UNAVAILABLE",
          "Model pricing is unavailable.",
        );
      // UTF-8 byte length is a conservative token bound, with room for chat framing.
      const inputCost =
        ((1024 +
          request.messages.reduce(
            (sum, message) => sum + Buffer.byteLength(message.content, "utf8"),
            0,
          )) /
          1_000_000) *
        price.inputUsdPerMillionTokens;
      const outputBudget =
        price.outputUsdPerMillionTokens === 0
          ? 8000
          : Math.floor(
              ((dispatch.maximumCostUsd - inputCost) * 1_000_000) /
                price.outputUsdPerMillionTokens,
            );
      if (outputBudget < 1)
        throw new JobExecutionError(
          "terminal",
          "RECOVERY_ALLOWANCE_EXHAUSTED",
          "Source checking requires additional allowance.",
        );
      await dispatch.authorize("model");
      return provider.complete(
        {
          ...request,
          maxOutputTokens: Math.min(
            request.maxOutputTokens ?? 8000,
            outputBudget,
            32000,
          ),
        },
        { disableRetries: true },
      );
    },
  };
}
