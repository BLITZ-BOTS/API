import { Hono } from "hono";
import { z } from "zod";
import { jsonResponse } from "@/lib/response";
import { logger } from "@/lib/logger";
import { pluginCreateParamsSchema, propertySchemas } from "@/schema/plugin";
import { deletePlugin, getPlugin, getPlugins, searchPlugins } from "@/lib/registry-api";
import { publishPlugin, updatePlugin } from "@/lib/plugin-publish";
import { basicPaginationSchema } from "@/schema/pagination";
import type { HonoParams } from "@/types/vars";
import { requireAuth } from "@/middlewares/auth";
import { parseBodySchema, parseParamsSchema, parseQuerySchema } from "@/lib/validation";

export const pluginsRoutes = new Hono<HonoParams>();

const searchSchema = basicPaginationSchema.extend({
  query: z.string(),
});

/* POST / - uploads a plugin, follows pluginParamsSchema */
pluginsRoutes.post("/", requireAuth, async (c) => {
  logger.info("📥 Starting plugin upload request");

  const data = await parseBodySchema(c, pluginCreateParamsSchema);
  const user = c.get("user");

  try {
    if ((await getPlugin(data.name)) !== null) {
      return jsonResponse.error(
        c,
        "Plugin already exists",
        "If you want to update an already existing plugin, use PATCH method.",
        409
      );
    }

    const result = await publishPlugin(data, user.id);

    logger.info(`✅ Plugin uploaded successfully: ${data.name}`);
    return jsonResponse.success(c, result);
  } catch (e) {
    logger.error(`❌ Error uploading plugin:`, e);
    throw e;
  }
});

pluginsRoutes.patch("/:name", requireAuth, async (c) => {
  const data = await parseBodySchema(c, pluginCreateParamsSchema);
  const repo = await getPlugin(data.name);

  if (!repo) {
    return jsonResponse.error(c, "Plugin not found", "", 404);
  }

  if (repo.author !== c.get("user").id) {
    return jsonResponse.error(c, "Unauthorized", "You can't update this.", 401);
  }

  const newRepo = await updatePlugin(data, c.get("user").id, repo);

  return jsonResponse.success(c, newRepo);
});

/* DELETE /:name - deletes a plugin */
pluginsRoutes.delete("/:name", requireAuth, async (c) => {
  const name = parseParamsSchema(c, propertySchemas.name, "name");
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
  const { query, page, per_page } = parseQuerySchema(c, searchSchema);

  const data = await searchPlugins(query, page, per_page);

  return jsonResponse.success(c, data);
});

/* GET /?page=1&per_page=100 - returns 100 plugins page 1 */
pluginsRoutes.get("/", async (c) => {
  const { page, per_page } = parseQuerySchema(c, basicPaginationSchema);

  const data = await getPlugins(page, per_page);

  return jsonResponse.success(c, data);
});

/* GET /get/music-bot - returns info about music-bot */
pluginsRoutes.get("/get/:name/:version", async (c) => {
  const name = parseParamsSchema(c, propertySchemas.name);
  const version = parseParamsSchema(c, propertySchemas.version);

  const repo = await getPlugin(name, {
    version,
    showAllVersions: true,
  });

  if (!repo) {
    return jsonResponse.error(c, "Plugin not found", "", 404);
  }

  return jsonResponse.success(c, repo);
});

/* GET /get/music-bot - returns info about music-bot */
pluginsRoutes.get("/get/:name", async (c) => {
  const name = parseParamsSchema(c, propertySchemas.name);

  const repo = await getPlugin(name, {
    showAllVersions: true,
  });

  if (!repo) {
    return jsonResponse.error(c, "Plugin not found", "", 404);
  }

  return jsonResponse.success(c, repo);
});

pluginsRoutes.get("/user/:id", async (c) => {
  const id = parseParamsSchema(c, z.string(), "id");

  const repos = await getPlugins(1, 100, id);

  return jsonResponse.success(c, repos);
});
