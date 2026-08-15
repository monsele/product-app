import type { Identifier } from "@avlp/config";
import {
  contentBlocks,
  parsedDocuments,
  parsedSections,
  type DatabaseClient,
} from "@avlp/database";
import { and, eq } from "drizzle-orm";

/** Tenant-scoped read model for ingestion review and downstream source lookup. */
export class ParsedDocumentRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async findForProject(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sourceDocumentId: Identifier;
  }): Promise<
    | {
        document: typeof parsedDocuments.$inferSelect;
        sections: readonly (typeof parsedSections.$inferSelect)[];
        blocks: readonly (typeof contentBlocks.$inferSelect)[];
      }
    | undefined
  > {
    const [document] = await this.database
      .select()
      .from(parsedDocuments)
      .where(
        and(
          eq(parsedDocuments.ownerUserId, input.ownerUserId),
          eq(parsedDocuments.projectId, input.projectId),
          eq(parsedDocuments.sourceDocumentId, input.sourceDocumentId),
        ),
      )
      .orderBy(parsedDocuments.createdAt)
      .limit(1);
    if (document === undefined) return undefined;
    const [sections, blocks] = await Promise.all([
      this.database
        .select()
        .from(parsedSections)
        .where(eq(parsedSections.parsedDocumentId, document.id))
        .orderBy(parsedSections.order),
      this.database
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.parsedDocumentId, document.id))
        .orderBy(contentBlocks.pageStart, contentBlocks.order),
    ]);
    return { document, sections, blocks };
  }
}
