import { z } from "zod";
import { authorSchema } from "./author";

const versionSchema = z.string().min(1).max(10);
const nameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9-_.]+$/)
  .transform((nam) => nam.toUpperCase().trim());
const fileSchema = z
  .instanceof(File)
  .refine(
    (f) =>
      f.type === "application/zip" &&
      f.size < 1024 * 1024 * 5 /* max 5mb */ &&
      f.name.toLowerCase().trim().endsWith(".zip")
  );

export const pluginSchema = z.object({
  name: nameSchema,
  description: z.string().max(100).nullish().default(null),
  versions: z.array(versionSchema).min(1),
  author_id: z.string().min(1),
  author: authorSchema.nullish().default(null),
  tags: z.array(z.string()).default([]),
  homepage: z.string().url().nullish().default(null),
  repoUrl: z.string().url(),
});

export const pluginCreateParamsSchema = pluginSchema
  .omit({ author: true, author_id: true, repoUrl: true, versions: true })
  .extend({
    file: fileSchema,
    version: versionSchema,
  });

export const pluginUpdateParamsSchema = pluginSchema
  .omit({ author: true, author_id: true, repoUrl: true, versions: true })
  .extend({
    file: fileSchema,
    version: versionSchema,
  });

export const propertySchemas = {
  name: nameSchema,
  file: fileSchema,
  version: versionSchema,
};
