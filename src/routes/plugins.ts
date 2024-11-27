import { Hono } from "hono";
import { z } from "zod";
import { jsonResponse } from "@/lib/response";
import { logger } from "@/lib/logger";
import { pluginParamsSchema } from "@/schema/plugin";
import { deletePlugin, getPlugin, getPlugins } from "@/lib/registry-api";
import { publishPlugin } from "@/lib/plugin-publish";

export const pluginsRoutes = new Hono();

const listParamsSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  per_page: z.coerce.number().min(1).max(100).optional().default(25),
});

pluginsRoutes.post("/", async (c) => {
  logger.info("📥 Starting plugin upload request");

  const reqParts = await c.req.parseBody();
  const data = pluginParamsSchema.parse(reqParts);

  try {
    const result = await publishPlugin({
      ...data,
      userId: c.user?.id,
    });

    if (!result.success) {
      return jsonResponse.error(
        c,
        result.error ?? "Unknown error",
        result.message ?? "There was an unknown error while creating.",
        result.status
      );
    }

    logger.info(`✅ Plugin uploaded successfully: ${data.name}`);
    return jsonResponse.success(c, result.data);
  } catch (e) {
    logger.error(`❌ Error uploading plugin:`, e);
    throw e;
  }
});

pluginsRoutes.delete("/:name", async (c) => {
  const name = c.req.param("name");
  const repo = await getPlugin(name);

  if (!repo) {
    return jsonResponse.error(c, "Plugin not found", "", 404);
  }

  if (repo.author !== c.user?.id) {
    return jsonResponse.error(c, "Unauthorized", "You can't delete this.", 401);
  }

  try {
    await deletePlugin(name);
    return jsonResponse.success(c, null);
  } catch (e) {
    logger.error(`❌ Error deleting plugin:`, e);
    throw e;
  }
});

pluginsRoutes.get("/all", async (c) => {
  const { page, per_page } = listParamsSchema.parse(c.req.query());

  const data = await getPlugins(page, per_page);

  return jsonResponse.success(c, data);
});
