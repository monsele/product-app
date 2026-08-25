# Runbook: render diagnostics

## Gather

Use the render ID and correlation ID to inspect the approved lesson version, validation run, content hash, renderer version, queue timings, attempt count, sanitized error, and output metadata. Do not download source material to an unmanaged workstation.

## Diagnose

1. Confirm the exact approved `LessonSpec` still validates.
2. Confirm all required audio, captions, and asset bindings are ready and content hashes match.
3. Run the provider-free renderer smoke fixture at 1080p.
4. Check memory, disk, font, browser, codec, and object-storage availability.
5. Reproduce the failing scene/frame before rendering the full lesson.

## Recover

- Retry transient infrastructure failures with the existing render idempotency key.
- Reuse unchanged scene artifacts.
- If validation or an asset is invalid, return the teacher to the specific issue instead of retrying blindly.
- Never make a failed or partial render the active output.

## Verify

Confirm MP4 duration and dimensions, thumbnail availability, signed download authorization, usage reconciliation, and that only the intentional completed render becomes current.
