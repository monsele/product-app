# Evaluation baseline

This provider-free baseline uses only synthetic, original science text written for this repository. Each case stores source text, `NormalizedDocument`, `LessonSpec`, audio timing, and an expected-frame placeholder. Audio-timing and expected-frame files are per-case placeholders until the audio and rendering stages exist; the default runner never calls AI, TTS, image, or rendering providers and needs no credentials.

Run `pnpm --filter @avlp/evals eval` for deterministic JSON results. Future paid evaluations must be initiated explicitly, record the prompt version, provider/model, approval, and evaluation delta, and must run outside default CI.

The automated rubric dimensions are schema validity, objective-coverage placeholder, duration, text density, and citation resolvability. The remaining rubric dimensions from technical-guide 9.5 are retained as manual fields until their corresponding pipeline stages exist.

## Fixture contract pinning

Valid lesson-spec fixtures are written against the current `LessonSpec` contract version (`lessonSpecVersion` from `@avlp/schemas`). A test pins the fixtures to that version so a contract bump fails loudly in CI instead of silently breaking the baseline.
