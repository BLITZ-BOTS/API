import { z } from "zod";

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
const VALID_ZIP_TYPES = ["application/zip", "application/x-zip-compressed"];

const nameSchema = z.string().min(3).max(64);
const tagsSchema = z
  .string()
  .optional()
  .describe("comma-separated list of tags")
  .transform((tags) => tags?.split(",").filter(Boolean) ?? []);

export const pluginSchema = z.object({
  name: nameSchema,
  description: z.string().max(2048),
  version: z.string(),
  author: z.string(),
  tags: tagsSchema,
});

const fileSchema = z
  .instanceof(File)
  .describe("zip file")
  .refine(
    (file) =>
      VALID_ZIP_TYPES.includes(file.type) &&
      file.name.toLowerCase().endsWith(".zip") &&
      file.size < FILE_SIZE_LIMIT
  );

export const pluginParamsSchema = pluginSchema.extend({
  file: fileSchema,
  name: nameSchema.refine(
    (name) => name.toLowerCase().trim() !== "all",
    '"all" is reserved, and cannot be used.'
  ),
});
