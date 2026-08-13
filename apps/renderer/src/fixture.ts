import {
  fullLessonCompositionPropsSchema,
  photosynthesisThreeMinutePreview,
  type FullLessonCompositionProps,
} from "@avlp/scene-library";
import {
  assertFixtureIntegrity,
  manualLessonFixtureId,
  type RenderJobPayload,
} from "./contracts.js";

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function loadImmutableFixture(
  payload: RenderJobPayload,
): Readonly<FullLessonCompositionProps> {
  if (payload.fixtureId !== manualLessonFixtureId)
    throw new Error("The requested render fixture is not registered.");
  const composition = fullLessonCompositionPropsSchema.parse(
    globalThis.structuredClone(photosynthesisThreeMinutePreview),
  );
  assertFixtureIntegrity(payload, composition);
  return deepFreeze(composition);
}
