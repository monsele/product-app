# Evaluation baseline

This provider-free baseline uses only synthetic, original science text written for this repository. Each case stores source text, `NormalizedDocument`, `LessonSpec`, audio timing, and an expected-frame placeholder. Audio-timing and expected-frame files are per-case placeholders until the audio and rendering stages exist; the default runner never calls AI, TTS, image, or rendering providers and needs no credentials.

Run `pnpm --filter @avlp/evals eval` for deterministic JSON results. Future paid evaluations must be initiated explicitly, record the prompt version, provider/model, approval, and evaluation delta, and must run outside default CI.

The automated rubric dimensions are schema validity, objective-coverage placeholder, duration, text density, and citation resolvability. The remaining rubric dimensions from technical-guide 9.5 are retained as manual fields until their corresponding pipeline stages exist.

## Fixture contract pinning

Valid lesson-spec fixtures are written against a readable `LessonSpec` contract version (`readableLessonSpecVersions` from `@avlp/schemas`). They stay on `1.8` because `1.9` (ST-104) only widened the audience and reads `1.8` in place. A test pins the fixtures to the readable set and checks they parse unchanged, so a contract break fails loudly in CI instead of silently breaking the baseline.
