import { z } from "zod";

export const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
});

export type Environment = z.infer<typeof environmentSchema>;

export const parseEnvironment = (
  input: Record<string, string | undefined>,
): Environment => environmentSchema.parse(input);
