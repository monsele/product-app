import { getTableColumns, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

/**
 * Fails when a schema table exposes project_id without the tenant ownership
 * column required by every project-scoped repository query.
 */
export function assertProjectOwnershipConventions(
  schema: Readonly<Record<string, unknown>>,
): void {
  const violations: string[] = [];
  for (const [exportName, value] of Object.entries(schema)) {
    if (!is(value, PgTable)) continue;
    const columns = getTableColumns(value);
    if ("projectId" in columns && !("ownerUserId" in columns))
      violations.push(exportName);
  }
  if (violations.length > 0)
    throw new Error(
      `Project-owned tables must include owner_user_id: ${violations.sort().join(", ")}`,
    );
}
