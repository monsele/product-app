import type { Identifier } from "@avlp/config";
import {
  parsedDocuments,
  sourceDocumentIngestionReuses,
  type DatabaseExecutor,
} from "@avlp/database";
import { and, desc, eq } from "drizzle-orm";

/**
 * Resolves the immutable parsed document visible to a project. A reused
 * artifact remains owned by its original project, while review overlays stay
 * owned by the project that reused it.
 */
export async function findLatestProjectParsedDocument(
  executor: DatabaseExecutor,
  input: { ownerUserId: Identifier; projectId: Identifier },
): Promise<typeof parsedDocuments.$inferSelect | undefined> {
  const [direct] = await executor
    .select()
    .from(parsedDocuments)
    .where(
      and(
        eq(parsedDocuments.ownerUserId, input.ownerUserId),
        eq(parsedDocuments.projectId, input.projectId),
      ),
    )
    .orderBy(desc(parsedDocuments.createdAt))
    .limit(1);
  if (direct !== undefined) return direct;

  const [reused] = await executor
    .select({ document: parsedDocuments })
    .from(sourceDocumentIngestionReuses)
    .innerJoin(
      parsedDocuments,
      eq(
        parsedDocuments.ingestionArtifactId,
        sourceDocumentIngestionReuses.ingestionArtifactId,
      ),
    )
    .where(
      and(
        eq(sourceDocumentIngestionReuses.ownerUserId, input.ownerUserId),
        eq(sourceDocumentIngestionReuses.projectId, input.projectId),
        eq(parsedDocuments.ownerUserId, input.ownerUserId),
      ),
    )
    .orderBy(desc(sourceDocumentIngestionReuses.createdAt))
    .limit(1);
  return reused?.document;
}
