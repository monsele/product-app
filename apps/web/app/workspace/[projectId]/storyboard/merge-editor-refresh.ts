/** Three-way refresh: adopt server changes only where the teacher has not edited.
 * Arrays are one field, so reordering cannot accidentally merge unrelated items. */
export function mergeEditorRefresh<T>(
  base: T,
  local: T,
  incoming: T,
): { value: T; conflicts: string[] } {
  const conflicts: string[] = [];
  const equal = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const merge = (
    before: unknown,
    mine: unknown,
    theirs: unknown,
    path: string,
  ): unknown => {
    if (equal(mine, before)) return theirs;
    if (equal(theirs, before) || equal(mine, theirs)) return mine;
    if (object(before) && object(mine) && object(theirs)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(mine),
        ...Object.keys(theirs),
      ])) {
        const value = merge(
          before[key],
          mine[key],
          theirs[key],
          path ? `${path}.${key}` : key,
        );
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    conflicts.push(path);
    return mine;
  };
  return { value: merge(base, local, incoming, "") as T, conflicts };
}
