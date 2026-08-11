import { z } from "zod";

const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const identifierSchema = z
  .string()
  .regex(uuidV7Pattern, "Expected a UUIDv7.");
export type Identifier = z.infer<typeof identifierSchema>;
