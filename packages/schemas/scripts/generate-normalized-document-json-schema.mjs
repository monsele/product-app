import { writeFile } from "node:fs/promises";
import { normalizedDocumentJsonSchema } from "../dist/index.js";

await writeFile(
  new URL("../normalized-document-v1.schema.json", import.meta.url),
  `${JSON.stringify(normalizedDocumentJsonSchema, null, 2)}\n`,
);
