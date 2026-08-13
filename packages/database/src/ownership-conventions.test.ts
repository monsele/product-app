import { describe, expect, it } from "vitest";
import { pgTable, uuid } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";
import { assertProjectOwnershipConventions } from "./ownership-conventions.js";

describe("project ownership schema convention", () => {
  it("keeps every current project-scoped table tenant owned", () => {
    expect(() => assertProjectOwnershipConventions(schema)).not.toThrow();
  });

  it("catches an intentionally unscoped future table", () => {
    const unscopedResources = pgTable("unscoped_resources", {
      id: uuid("id").primaryKey(),
      projectId: uuid("project_id").notNull(),
    });

    expect(() =>
      assertProjectOwnershipConventions({ unscopedResources }),
    ).toThrow(
      "Project-owned tables must include owner_user_id: unscopedResources",
    );
  });
});
