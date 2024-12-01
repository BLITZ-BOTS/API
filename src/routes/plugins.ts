import { Hono } from "hono";
import { z } from "zod";
import { jsonResponse } from "@/lib/response";
import { logger } from "@/lib/logger";
import { pluginParamsSchema } from "@/schema/plugin";
import { deletePlugin, getPlugin, getPlugins, searchPlugins } from "@/lib/registry-api";
import { publishPlugin } from "@/lib/plugin-publish";
import { basicPaginationSchema } from "@/schema/pagination";
import type { HonoParams } from "@/types/vars";

export const pluginsRoutes = new Hono<HonoParams>();

const searchSchema = basicPaginationSchema.extend({
  query: z.string(),
});

/* POST / - uploads a plugin, follows pluginParamsSchema */
pluginsRoutes.post("/", async (c) => {
  logger.info("📥 Starting plugin upload request");

  const reqParts = await c.req.parseBody();
  const data = pluginParamsSchema.parse(reqParts);
  const user = c.get("user");

  try {
    const result = await publishPlugin({
      ...data,
      userId: user?.id,
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

/* DELETE /:name - deletes a plugin */
pluginsRoutes.delete("/:name", async (c) => {
  const name = z.string().parse(c.req.param("name"));
  const repo = await getPlugin(name);

  if (!repo) {
    return jsonResponse.error(c, "Plugin not found", "", 404);
  }

  if (repo.author !== c.get("user").id) {
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

/* GET /?query=music&page=1&per_page=100 - returns 100 plugins page 1 for query "music" */
pluginsRoutes.get("/search", async (c) => {
  const { query, page, per_page } = searchSchema.parse(c.req.query());

  const data = await searchPlugins(query, page, per_page);

  return jsonResponse.success(c, data);
});

/* GET /?page=1&per_page=100 - returns 100 plugins page 1 */
pluginsRoutes.get("/", async (c) => {
  const { page, per_page } = basicPaginationSchema.parse(c.req.query());

  const data = await getPlugins(page, per_page);

  return jsonResponse.success(c, data);
});

/* GET /get/music-bot - returns info about music-bot */
pluginsRoutes.get("/get/:name", async (c) => {
  const name = z.string().parse(c.req.param("name"));
  const repo = await getPlugin(name);

  if (!repo) {
    return jsonResponse.error(c, "Plugin not found", "", 404);
  }

  return jsonResponse.success(c, repo);
});
