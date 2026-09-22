/**
 * Treats model duration estimates as relative weights: clamps each to
 * [minimum, maximum], scales the set to the target total, and rounds so the
 * sum equals the target exactly. Returns undefined when the target cannot be
 * reached with this many items inside the bounds.
 */
export function allocateDurationsToTarget(input: {
  estimates: readonly number[];
  target: number;
  minimum: number;
  maximum: number;
}): number[] | undefined {
  const { minimum, maximum, target } = input;
  const count = input.estimates.length;
  if (target < count * minimum || target > count * maximum) return undefined;
  const sum = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0);
  const clamp = (value: number): number =>
    Math.min(maximum, Math.max(minimum, Math.round(value)));
  let durations = input.estimates.map(clamp);
  for (let attempt = 0; attempt < 20 && sum(durations) !== target; attempt += 1) {
    const factor = target / Math.max(1, sum(durations));
    durations = durations.map((duration) => clamp(duration * factor));
  }
  let guard = 0;
  if (sum(durations) > target) {
    while (sum(durations) > target && guard < 10_000) {
      let largestIndex = -1;
      for (let index = 0; index < durations.length; index += 1)
        if (
          durations[index]! > minimum &&
          (largestIndex === -1 || durations[index]! > durations[largestIndex]!)
        )
          largestIndex = index;
      if (largestIndex === -1) break;
      durations[largestIndex] = durations[largestIndex]! - 1;
      guard += 1;
    }
  } else if (sum(durations) < target) {
    while (sum(durations) < target && guard < 10_000) {
      let smallestIndex = -1;
      for (let index = 0; index < durations.length; index += 1)
        if (
          durations[index]! < maximum &&
          (smallestIndex === -1 ||
            durations[index]! < durations[smallestIndex]!)
        )
          smallestIndex = index;
      if (smallestIndex === -1) break;
      durations[smallestIndex] = durations[smallestIndex]! + 1;
      guard += 1;
    }
  }
  return sum(durations) === target ? durations : undefined;
}
