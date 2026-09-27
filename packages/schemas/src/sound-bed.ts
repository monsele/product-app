/**
 * ST-103 — background sound bed catalog and post-render review contracts.
 *
 * The sound bed is presentation, not lesson content (ADR-008, ADR-012): it is
 * never part of `LessonSpec`. A lesson configuration names a catalog track (or
 * `none`), a saved lesson version pins the resolved track identity, and the
 * render manifest carries that pinned identity so a re-render never consults
 * the current configuration or catalog.
 */
import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";

const sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, "Expected a hexadecimal SHA-256 checksum.")
  .transform((value) => value.toLowerCase());

/** A stable catalog slug. It is never reused for different audio bytes. */
export const soundBedTrackIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{2,63}$/,
    "A sound bed track ID must be a lower-case slug.",
  );
export type SoundBedTrackId = z.infer<typeof soundBedTrackIdSchema>;

export const soundBedNone = "none" as const;

/** The lesson-configuration choice. `none` is the default and the reading of
 * every configuration stored before ST-103. */
export const soundBedChoiceSchema = z.union([
  z.literal(soundBedNone),
  soundBedTrackIdSchema,
]);
export type SoundBedChoice = z.infer<typeof soundBedChoiceSchema>;

/** Reads a stored configuration value that may predate ST-103. */
export function readSoundBedChoice(value: unknown): SoundBedChoice {
  if (value === null || value === undefined) return soundBedNone;
  const parsed = soundBedChoiceSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("The stored sound bed choice is not a registered value.");
  return parsed.data;
}

/** Every catalog track lives under this platform-owned, read-only prefix. It
 * is deliberately outside every tenant prefix: the bytes are shared catalog
 * media, and no request can write to it. */
export const soundBedCatalogPrefix = "catalog/sound-beds" as const;

export const soundBedStorageKeySchema = z
  .string()
  .regex(
    /^catalog\/sound-beds\/[a-z][a-z0-9-]{2,63}\/[0-9a-f]{64}\.wav$/,
    "A sound bed storage key must be a checksum-addressed catalog key.",
  );

export const soundBedLicenseIdSchema = z.enum(["CC0-1.0"]);
export type SoundBedLicenseId = z.infer<typeof soundBedLicenseIdSchema>;

export const soundBedMoodSchema = z.enum([
  "calm",
  "warm",
  "bright",
  "focused",
  "playful",
  "reflective",
]);
export type SoundBedMood = z.infer<typeof soundBedMoodSchema>;

/** Longest supported lesson (420 s). A track shorter than this must loop. */
export const soundBedMaximumLessonMs = 420_000 as const;

export const soundBedCatalogEntrySchema = z
  .object({
    trackId: soundBedTrackIdSchema,
    title: z.string().trim().min(1).max(120),
    moodTags: z.array(soundBedMoodSchema).min(1).max(4),
    /** Exact media duration. A looping track's duration is a whole number of
     * 30 fps frames so every repeat starts on a frame boundary. */
    durationMs: z.number().int().positive().max(900_000),
    loops: z.boolean(),
    /** Integrated loudness measured once at registration, after normalisation. */
    integratedLoudnessLufs: z.number().finite().min(-40).max(-6),
    /** Sample peak measured at registration; the review uses it to bound the
     * bed's contribution under narration. */
    peakDbfs: z.number().finite().min(-60).max(0),
    checksumSha256: sha256Schema,
    storageKey: soundBedStorageKeySchema,
    contentType: z.literal("audio/wav"),
    licenseId: soundBedLicenseIdSchema,
    sourceUrl: z.string().url().max(500),
    /** Required attribution text, or `null` when the license requires none. */
    attributionText: z.string().trim().min(1).max(500).nullable(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (!entry.storageKey.startsWith(`${soundBedCatalogPrefix}/${entry.trackId}/`))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storageKey"],
        message: "A track's storage key must be under its own catalog path.",
      });
    if (!entry.storageKey.endsWith(`/${entry.checksumSha256}.wav`))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storageKey"],
        message: "A track's storage key must be addressed by its checksum.",
      });
    if (!entry.loops && entry.durationMs < soundBedMaximumLessonMs)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loops"],
        message:
          "A track shorter than the longest lesson must loop seamlessly.",
      });
    if (entry.loops && entry.durationMs % 100 !== 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMs"],
        message:
          "A looping track must last a whole number of tenths of a second.",
      });
  });
export type SoundBedCatalogEntry = z.infer<typeof soundBedCatalogEntrySchema>;

/**
 * The resolved track pinned into an immutable lesson-version snapshot and the
 * render manifest. It holds identities only; a signed URL is created at
 * execution time and never stored (CR-02).
 */
export const pinnedSoundBedSchema = z
  .object({
    trackId: soundBedTrackIdSchema,
    checksumSha256: sha256Schema,
    storageKey: soundBedStorageKeySchema,
    contentType: z.literal("audio/wav"),
    durationMs: z.number().int().positive().max(900_000),
    loops: z.boolean(),
    integratedLoudnessLufs: z.number().finite().min(-40).max(-6),
    peakDbfs: z.number().finite().min(-60).max(0),
    licenseId: soundBedLicenseIdSchema,
    attributionText: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();
export type PinnedSoundBed = z.infer<typeof pinnedSoundBedSchema>;

export function pinSoundBed(entry: SoundBedCatalogEntry): PinnedSoundBed {
  return pinnedSoundBedSchema.parse({
    trackId: entry.trackId,
    checksumSha256: entry.checksumSha256,
    storageKey: entry.storageKey,
    contentType: entry.contentType,
    durationMs: entry.durationMs,
    loops: entry.loops,
    integratedLoudnessLufs: entry.integratedLoudnessLufs,
    peakDbfs: entry.peakDbfs,
    licenseId: entry.licenseId,
    attributionText: entry.attributionText,
  });
}

/**
 * Reads the pinned bed from a lesson-version snapshot. A snapshot saved before
 * ST-103 has no `soundBed` key and reads as `null` (no bed) without being
 * rewritten, which is what keeps those versions reproducible (ST-098).
 */
export function readPinnedSoundBed(snapshot: unknown): PinnedSoundBed | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const value = (snapshot as { soundBed?: unknown }).soundBed;
  if (value === undefined || value === null) return null;
  return pinnedSoundBedSchema.parse(value);
}

/** `GET /sound-beds`. The audition URL is short-lived and never persisted. */
export const soundBedCatalogItemSchema = z
  .object({
    trackId: soundBedTrackIdSchema,
    title: z.string().min(1).max(120),
    moodTags: z.array(soundBedMoodSchema).min(1).max(4),
    durationMs: z.number().int().positive(),
    loops: z.boolean(),
    integratedLoudnessLufs: z.number().finite(),
    licenseId: soundBedLicenseIdSchema,
    sourceUrl: z.string().url(),
    attributionText: z.string().min(1).max(500).nullable(),
    auditionUrl: z.string().url(),
    auditionExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type SoundBedCatalogItem = z.infer<typeof soundBedCatalogItemSchema>;

export const soundBedCatalogResponseSchema = z
  .object({ tracks: z.array(soundBedCatalogItemSchema).max(50) })
  .strict();
export type SoundBedCatalogResponse = z.infer<
  typeof soundBedCatalogResponseSchema
>;

// ---------------------------------------------------------------------------
// Post-render self-review
// ---------------------------------------------------------------------------

export const renderReviewSeveritySchema = z.enum(["error", "warning"]);
export type RenderReviewSeverity = z.infer<typeof renderReviewSeveritySchema>;

export const renderReviewFindingCodeSchema = z.enum([
  "STREAM_LAYOUT_INVALID",
  "STREAM_PROFILE_MISMATCH",
  "DURATION_MISMATCH",
  "BLACK_SEGMENT",
  "NARRATION_SILENT",
  "AUDIO_CLIPPING",
  "LOUDNESS_OUT_OF_RANGE",
  "CAPTION_TRACK_MISSING",
  "CAPTION_CUE_COUNT_MISMATCH",
]);
export type RenderReviewFindingCode = z.infer<
  typeof renderReviewFindingCodeSchema
>;

export const renderReviewFindingSchema = z
  .object({
    code: renderReviewFindingCodeSchema,
    severity: renderReviewSeveritySchema,
    /** Where the problem starts on the video timeline, when it has a place. */
    atMs: z.number().int().nonnegative().optional(),
    /** Measured values only — never media, source text, or URLs. */
    detail: z.string().min(1).max(500),
    /** The action a teacher can take to correct it. */
    correction: z.string().min(1).max(500),
  })
  .strict();
export type RenderReviewFinding = z.infer<typeof renderReviewFindingSchema>;

export const renderReviewContactFrameSchema = z
  .object({
    /** Fraction of the video duration the frame was sampled at. */
    position: z.number().min(0).max(1),
    atMs: z.number().int().nonnegative(),
    storageKey: z.string().min(1).max(1_024),
    checksumSha256: sha256Schema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type RenderReviewContactFrame = z.infer<
  typeof renderReviewContactFrameSchema
>;

export const renderReviewLoudnessSchema = z
  .object({
    integratedLufs: z.number().finite().nullable(),
    peakDbfs: z.number().finite().nullable(),
  })
  .strict();

export const renderReviewReportSchema = z
  .object({
    reviewVersion: z.string().min(1).max(100),
    /** The generic job attempt that produced and reviewed the video. */
    jobId: identifierSchema,
    attempt: z.number().int().positive(),
    /** `failed` exactly when at least one finding has error severity. */
    outcome: z.enum(["passed", "failed"]),
    videoChecksumSha256: sha256Schema,
    durationMs: z.number().int().nonnegative(),
    findings: z.array(renderReviewFindingSchema).max(200),
    contactSheet: z.array(renderReviewContactFrameSchema).max(8),
    loudness: renderReviewLoudnessSchema,
    reviewedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((report, context) => {
    const failed = report.findings.some((finding) => finding.severity === "error");
    if (failed !== (report.outcome === "failed"))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outcome"],
        message: "A review fails exactly when it has an error finding.",
      });
  });
export type RenderReviewReport = z.infer<typeof renderReviewReportSchema>;

/** The render page's view of a report: contact-sheet keys become short-lived
 * signed URLs at the authenticated boundary and are never returned raw. */
export const renderReviewSummarySchema = z
  .object({
    reviewVersion: z.string().min(1).max(100),
    outcome: z.enum(["passed", "failed"]),
    durationMs: z.number().int().nonnegative(),
    findings: z.array(renderReviewFindingSchema).max(200),
    contactSheet: z
      .array(
        z
          .object({
            position: z.number().min(0).max(1),
            atMs: z.number().int().nonnegative(),
            url: z.string().url(),
          })
          .strict(),
      )
      .max(8),
    loudness: renderReviewLoudnessSchema,
    reviewedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type RenderReviewSummary = z.infer<typeof renderReviewSummarySchema>;
