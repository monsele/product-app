// Pulls a rendered lesson out of object storage (or takes a local file),
// probes it, and cuts it into frames you can actually look at.
// See SKILL.md for usage.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const fromStorage = createRequire(
  path.join(repoRoot, "packages/storage/package.json"),
);

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  args.set(token.slice(2), next && !next.startsWith("--") ? next : "true");
}

const outDir = path.resolve(
  repoRoot,
  args.get("out") ?? ".runtime-logs/video-frames",
);
const everySeconds = Number(args.get("every") ?? 10);

// Remotion ships ffmpeg/ffprobe with its native compositor; nothing needs to be
// on PATH. The package is platform-suffixed, so find whichever one is installed.
function ffTool(name) {
  const pnpmDir = path.join(repoRoot, "node_modules/.pnpm");
  // e.g. "@remotion+compositor-win32-x64-msvc@4.0.507"
  const entry = readdirSync(pnpmDir).find((candidate) =>
    candidate.startsWith("@remotion+compositor-"),
  );
  if (entry === undefined)
    throw new Error("No @remotion/compositor-* package found — run pnpm install.");
  const packageName = entry.slice("@remotion+".length).split("@")[0];
  const binary = path.join(
    pnpmDir,
    entry,
    "node_modules/@remotion",
    packageName,
    process.platform === "win32" ? `${name}.exe` : name,
  );
  if (!existsSync(binary)) throw new Error(`Bundled ${name} not found at ${binary}`);
  return binary;
}

function env() {
  return Object.fromEntries(
    readFileSync(path.join(repoRoot, ".env"), "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => [
        line.slice(0, line.indexOf("=")).trim(),
        line.slice(line.indexOf("=") + 1).trim(),
      ]),
  );
}

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "product-app-postgres-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      "visual_learning",
      "-tAc",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

/** Downloads through the S3 API — the on-disk MinIO parts are not a usable mp4. */
async function download(storageKey, destination) {
  const config = env();
  const { S3Client, GetObjectCommand } = fromStorage("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: config.OBJECT_STORAGE_REGION ?? "us-east-1",
    endpoint: config.OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY,
    },
  });
  const object = await s3.send(
    new GetObjectCommand({
      Bucket: config.OBJECT_STORAGE_BUCKET,
      Key: storageKey,
    }),
  );
  writeFileSync(destination, Buffer.from(await object.Body.transformToByteArray()));
}

mkdirSync(outDir, { recursive: true });
let video = args.get("file")
  ? path.resolve(repoRoot, args.get("file"))
  : undefined;

if (video === undefined) {
  const project = args.get("project");
  // rendered_videos holds the authoritative key. Do not rebuild the path from
  // render_jobs.id — the artifact is filed under its own id, not the job's.
  const key = psql(
    `select storage_key from rendered_videos${
      project === undefined ? "" : ` where project_id='${project}'`
    } order by created_at desc limit 1;`,
  );
  if (key === "")
    throw new Error(
      project === undefined
        ? "No rendered video found. Render a lesson first, or pass --file."
        : `No rendered video for project ${project}.`,
    );
  video = path.join(outDir, "lesson.mp4");
  console.log(`Downloading ${key}`);
  await download(key, video);
}

const probe = execFileSync(
  ffTool("ffprobe"),
  [
    "-v", "error",
    "-show_entries", "format=duration",
    "-show_entries", "stream=width,height,r_frame_rate,codec_name",
    "-of", "default=noprint_wrappers=1",
    video,
  ],
  { encoding: "utf8" },
);
const duration = Number(/duration=([\d.]+)/.exec(probe)?.[1] ?? 0);
console.log(probe.trim());
if (duration === 0) throw new Error("Could not read a duration from the video.");

const ffmpeg = ffTool("ffmpeg");
const stamps = [];
// Stop a second short of the end: seeking past the last frame writes no file.
for (let t = 0; t < duration - 1; t += everySeconds) stamps.push(t);

for (const t of stamps) {
  const file = path.join(outDir, `t${String(Math.round(t)).padStart(4, "0")}s.png`);
  execFileSync(
    ffmpeg,
    ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-y", file],
    { encoding: "utf8" },
  );
}

console.log(
  `\n${stamps.length} frames every ${everySeconds}s in ${path.relative(repoRoot, outDir)}`,
);
console.log("Read the PNGs — a frame mid-transition is legitimately near-empty.");
