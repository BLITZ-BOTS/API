import { z } from "zod";

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
const VALID_ZIP_TYPES = ["application/zip", "application/x-zip-compressed"];

const tagsSchema = z
  .string()
  .optional()
  .describe("comma-separated list of tags")
  .transform((tags) => tags?.split(",").filter(Boolean) ?? []);

const fileSchema = z
  .instanceof(File)
  .describe("zip file")
  .refine(
    (file) =>
      VALID_ZIP_TYPES.includes(file.type) &&
      file.name.toLowerCase().endsWith(".zip") &&
      file.size < FILE_SIZE_LIMIT
  );

export const pluginSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  tags: tagsSchema,
  url: z.string().url(),
});

export const pluginParamsSchema = pluginSchema.extend({
  file: fileSchema,
  name: z
    .string()
    .max(100)
    .refine(
      (nam) => !["all", "search"].includes(nam.toLowerCase().trim()),
      "Name is reserved, and cannot be used."
    ),
});
