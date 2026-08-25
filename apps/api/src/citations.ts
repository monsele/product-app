import { PublicError, type Identifier } from "@avlp/config";
import { lessonSpecs, type DatabaseClient } from "@avlp/database";
import {
  lessonStoryboardSchema,
  sceneCitationsResponseSchema,
  type SceneCitationsResponse,
} from "@avlp/schemas";
import { and, desc, eq } from "drizzle-orm";
import type { SourceSnapshotService } from "./source-snapshot.js";

export interface CitationService {
  forScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
  }): Promise<SceneCitationsResponse>;
}

type LessonSpecRow = typeof lessonSpecs.$inferSelect;

/**
 * Resolves a storyboard scene's embedded source references into teacher-facing
 * citations. The scene is read from the working (draft, else approved) lesson
 * spec and resolved against the latest approved source snapshot, so excerpts
 * are always tenant-scoped and grounded in the immutable approved content.
 */
export class PostgresCitationService implements CitationService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly resolveSourceRefs: SourceSnapshotService["resolveSourceRefs"],
  ) {}

  public async forScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
  }): Promise<SceneCitationsResponse> {
    const row = await this.workingLessonSpecRow(
      input.ownerUserId,
      input.projectId,
    );
    if (row === undefined) throw sceneNotFound();
    const storyboard = lessonStoryboardSchema.parse(row.payload);
    const scene = storyboard.scenes.find(
      (entry) => entry.stableSceneId === input.sceneId,
    );
    if (scene === undefined) throw sceneNotFound();
    const citations = await this.resolveSourceRefs({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      sourceRefs: scene.scene.sourceRefs,
    });
    return sceneCitationsResponseSchema.parse({
      sceneId: input.sceneId,
      citations,
      generatedAdditions: scene.scene.generatedAdditions,
    });
  }

  private async workingLessonSpecRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<LessonSpecRow | undefined> {
    const draft = await this.latestLessonSpecRow(
      ownerUserId,
      projectId,
      "draft",
    );
    if (draft !== undefined) return draft;
    return this.latestLessonSpecRow(ownerUserId, projectId, "approved");
  }

  private async latestLessonSpecRow(
    ownerUserId: Identifier,
    projectId: Identifier,
    status: "draft" | "approved",
  ): Promise<LessonSpecRow | undefined> {
    const [row] = await this.database
      .select()
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.ownerUserId, ownerUserId),
          eq(lessonSpecs.projectId, projectId),
          eq(lessonSpecs.status, status),
        ),
      )
      .orderBy(desc(lessonSpecs.generatedAt))
      .limit(1);
    return row;
  }
}

function sceneNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested scene was not found.",
    404,
  );
}
