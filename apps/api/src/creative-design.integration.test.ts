import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  migrateDatabase,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { PostgresCreativeDesignService } from "./creative-design.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000102";
const projectId: Identifier = "019ffbf1-bbbb-7000-8000-000000000102";

async function seed(database: DatabaseClient): Promise<void> {
  await database.insert(users).values({
    id: ownerUserId,
    emailNormalized: "teacher-102@example.test",
    displayName: "Teacher",
  });
}

describeWithPostgres("PostgresCreativeDesignService GA access (Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: PostgresCreativeDesignService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(creativeDesignDrafts);
    await database!.client.delete(users);
    await seed(database!.client);
    service = new PostgresCreativeDesignService(database!.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  // ST-102 removed the pilot cohort gate: creative design is generally
  // available, not restricted to an allowlisted user ID. Before this change
  // every method here threw a 404 "Creative design is not enabled for this
  // account" for any owner not on the cohort list.
  it("serves any authenticated owner without a pilot cohort check", async () => {
    await expect(
      service.getDraft({ ownerUserId, projectId }),
    ).resolves.toBeNull();
  });
});
