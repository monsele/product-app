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

The initializer explicitly disables anonymous access. Production buckets must
also block public access, require TLS, use least-privilege credentials, enable
encryption at rest, and restrict CORS to the application origin and required
upload headers. Signed URLs and credentials must not be logged or persisted.

## Key and retention conventions

Use the exported `storageKeys` builders for source uploads, parser artifacts,
assets, scene audio, and renders. They validate UUIDv7 tenant/entity identifiers
and never interpolate filenames or other user-controlled path fragments.

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
