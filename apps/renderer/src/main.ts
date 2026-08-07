import { parseWorkerEnvironment } from "@avlp/config";
import { health } from "./health.js";

parseWorkerEnvironment(process.env);
console.info(JSON.stringify(health()));
