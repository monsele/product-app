import { createServer } from "node:http";

const now = "2026-08-13T12:00:00.000Z";
const existingId = "019ffbf1-610e-738a-b087-6775ff97568c";
const createdId = "019ffbf1-610f-738a-b087-6775ff97568c";
const projects = new Map([
  [
    existingId,
    {
      id: existingId,
      title: "Existing water-cycle lesson",
      stage: "draft",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    },
  ],
]);
const uploads = new Map();

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3002");
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "POST, PUT, OPTIONS",
      "access-control-allow-headers": "content-type, x-amz-checksum-sha256",
    });
    return response.end();
  }
  response.setHeader("access-control-allow-origin", "http://127.0.0.1:3000");
  response.setHeader("access-control-allow-credentials", "true");
  if (request.method === "GET" && url.pathname === "/health")
    return send(response, 200, { status: "ok" });
  if (
    request.method === "GET" &&
    url.pathname === "/projects" &&
    url.searchParams.get("cursor") === "malformed-response"
  )
    return send(response, 200, {
      items: [{ ...projects.get(existingId), stage: "not-a-project-stage" }],
    });
  if (request.method === "GET" && url.pathname === "/projects")
    return send(response, 200, { items: [...projects.values()] });
  if (request.method === "POST" && url.pathname === "/projects") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    if (input.title === "Malformed project response")
      return send(response, 201, { project: { id: "not-a-project-id" } });
    const project = {
      id: createdId,
      title: input.title,
      stage: "draft",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    projects.set(createdId, project);
    return send(response, 201, { project });
  }
  const uploadMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/source-upload$/,
  );
  if (request.method === "POST" && uploadMatch !== null) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const sessionId = "019ffbf1-6110-738a-b087-6775ff97568c";
    uploads.set(sessionId, {
      uploaded: false,
      projectId: uploadMatch[1],
      input,
    });
    return send(response, 201, {
      sessionId,
      documentId: "019ffbf1-6111-738a-b087-6775ff97568c",
      uploadUrl: `http://127.0.0.1:3002/signed-upload/${sessionId}`,
      method: "PUT",
      requiredHeaders: { "content-type": input.mediaType },
      expiresAt: "2026-08-13T12:05:00.000Z",
    });
  }
  const completionMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/source-upload\/([^/]+)\/complete$/,
  );
  if (request.method === "POST" && completionMatch !== null) {
    const upload = uploads.get(completionMatch[2]);
    return upload?.uploaded === true && upload.projectId === completionMatch[1]
      ? send(response, 201, {
          documentId: "019ffbf1-6111-738a-b087-6775ff97568c",
          status: "active",
          ingestionRequested: true,
        })
      : send(response, 400, { error: { code: "validation_failed" } });
  }
  const signedUploadMatch = url.pathname.match(/^\/signed-upload\/([^/]+)$/);
  if (request.method === "PUT" && signedUploadMatch !== null) {
    const upload = uploads.get(signedUploadMatch[1]);
    if (upload === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    for await (const _chunk of request) {
      // Consume the direct-to-storage body without proxying it through Next.js.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    upload.uploaded = true;
    response.writeHead(200);
    return response.end();
  }
  if (request.method === "GET" && url.pathname.startsWith("/projects/")) {
    const project = projects.get(decodeURIComponent(url.pathname.slice(10)));
    return project === undefined
      ? send(response, 404, { error: { code: "not_found" } })
      : send(response, 200, { project });
  }
  return send(response, 404, { error: { code: "not_found" } });
});

server.listen(3002, "127.0.0.1");
