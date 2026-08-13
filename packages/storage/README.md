# Private object storage

`@avlp/storage` owns the provider-neutral object-storage contract and its
S3-compatible adapter. Domain code stores stable object keys, never signed URLs.

## Local MinIO

Start MinIO and create the private development bucket:

```powershell
docker compose up -d --wait minio
docker compose run --rm minio-init
```

The S3 API is available at `http://localhost:9000` and the console at
`http://localhost:9001`. The checked-in development defaults are intentionally
local-only. Override them outside local development.

```text
OBJECT_STORAGE_ENDPOINT=http://localhost:9000
OBJECT_STORAGE_BUCKET=visual-learning-private
OBJECT_STORAGE_ACCESS_KEY=minioadmin
OBJECT_STORAGE_SECRET_KEY=minioadmin123
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT=true
SIGNED_URL_TTL_SECONDS=300
MAX_UPLOAD_BYTES=26214400
```

Create the adapter with the async `createS3CompatibleObjectStorage` factory and
`allowedPrefix: "users"` and the parsed `NODE_ENV` as `runtimeEnvironment`.
The factory rejects insecure endpoints unless non-production local development
explicitly opts in, and it fails startup when the bucket ACL or policy permits
public access. Application services must
authorize the user and project before asking the adapter for a signed URL. The
adapter accepts only keys beneath the configured prefix, enforces upload MIME
types and length, and caps signed-URL lifetime.

Project features must use `AuthorizedProjectStorage` for signed upload and
download URLs. Its methods take the authenticated user ID separately from the
validated request DTO, so a client cannot claim an owner identity. Public DTOs
accept only a project ID and semantic object locator such as `source_original`
or `render_video`; they never accept a raw storage key. The wrapper calls the
shared project authorizer first and derives the tenant-scoped key only after
access succeeds. Direct calls to the lower-level signing methods are reserved
for infrastructure composition and non-project objects.

User-authorized upload DTOs are narrower than downloads: they allow only
`source_original` and `asset_original`. Parser outputs, audio, renders, and
thumbnails are immutable/generated artifacts and can be written only by
trusted workers through the internal storage interface.

The initializer explicitly disables anonymous access. Production buckets must
also block public access, require TLS, use least-privilege credentials, enable
encryption at rest, and restrict CORS to the application origin and required
upload headers. Signed URLs and credentials must not be logged or persisted.

## Key and retention conventions

Use the exported `storageKeys` builders for source uploads, parser artifacts,
assets, scene audio, and renders. They validate UUIDv7 tenant/entity identifiers
and never interpolate filenames or other user-controlled path fragments.
Render videos and thumbnails share the deterministic
`renders/{renderJobId}/lesson.mp4` and `renders/{renderJobId}/thumbnail.png`
directory beneath the owning user and project.

`replaceLifecycleConfiguration` deliberately accepts the complete desired rule
set and replaces the bucket configuration. It is intended for one serialized
infrastructure reconciler, not incremental application calls. A later deletion
workflow owns the product retention periods, and an empty rule set is rejected.

Run the live adapter contract against local MinIO with:

```powershell
$env:STORAGE_INTEGRATION='1'
$env:OBJECT_STORAGE_ENDPOINT='http://localhost:9000'
$env:OBJECT_STORAGE_ACCESS_KEY='minioadmin'
$env:OBJECT_STORAGE_SECRET_KEY='minioadmin123'
pnpm --filter @avlp/storage test:integration
```
