# Authentication package

`@avlp/auth` owns the provider-neutral `AuthGateway` contract and the
application-managed Postgres implementation used by ST-025.

The API exposes `POST /auth/register`, `POST /auth/login`, `DELETE
/auth/session`, and `GET /auth/session`. Successful register/login responses
set the `avlp_session` secure, HttpOnly, SameSite=Lax cookie. The raw cookie
value is opaque; only an HMAC hash is persisted.

Required API configuration:

- `AUTH_SESSION_SECRET`: at least 32 characters, used to hash opaque session
  tokens and rate-limit keys.
- `WEB_ORIGIN`: required in production; the allowed browser origin for CORS
  and state-changing request origin checks.
- `PASSWORD_RESET_TTL_SECONDS`: reset-link lifetime, 15 minutes by default.
- `PASSWORD_RESET_EMAIL_WEBHOOK_URL`: optional transactional-email adapter
  endpoint. It receives `{ recipient, resetUrl }`; keep it server-side and use
  HTTPS in production. `PASSWORD_RESET_EMAIL_WEBHOOK_TOKEN` is sent as a bearer
  credential when configured.

The API always returns the same accepted response for password-reset requests.
Reset secrets are random 32-byte values, appear only in the HTTPS email link,
and are persisted as keyed hashes. A successful reset atomically consumes its
token and revokes all active sessions for that user.

The local rate limiter bounds five register/login attempts per minute by both
HMAC-derived email and network keys. Production deployments with multiple API
instances must also apply a shared edge rate limiter.

Expose the API behind the same public web origin (for example, through a
reverse-proxy `/api` path). This keeps the HttpOnly session cookie first-party
to the workspace server and avoids cross-site-cookie behavior.
