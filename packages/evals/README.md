# Evaluation baseline

This provider-free baseline uses only synthetic, original science text written for this repository. Each case stores source text, `NormalizedDocument`, `LessonSpec`, audio timing, and an expected-frame placeholder. The default runner never calls AI, TTS, image, or rendering providers and needs no credentials.

Run `pnpm --filter @avlp/evals eval` for deterministic JSON results. Future paid evaluations must be initiated explicitly, record the prompt version, provider/model, approval, and evaluation delta, and must run outside default CI.

The automated rubric dimensions are schema validity, objective-coverage placeholder, duration, text density, and citation resolvability. The remaining rubric dimensions from technical-guide 9.5 are retained as manual fields until their corresponding pipeline stages exist.
