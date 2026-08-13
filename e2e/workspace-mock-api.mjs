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

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3002");
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
  if (request.method === "GET" && url.pathname.startsWith("/projects/")) {
    const project = projects.get(decodeURIComponent(url.pathname.slice(10)));
    return project === undefined
      ? send(response, 404, { error: { code: "not_found" } })
      : send(response, 200, { project });
  }
  return send(response, 404, { error: { code: "not_found" } });
});

server.listen(3002, "127.0.0.1");
