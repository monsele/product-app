import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

import { lessonSpecJsonSchema } from "../dist/index.js";

const outputPath = fileURLToPath(
  new URL("../lesson-spec-v1.schema.json", import.meta.url),
);
await writeFile(
  outputPath,
  await format(JSON.stringify(lessonSpecJsonSchema), { parser: "json" }),
);
