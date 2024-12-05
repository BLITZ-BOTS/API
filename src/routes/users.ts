import { getPlugins } from "@/lib/registry-api";
import { jsonResponse } from "@/lib/response";
import { getUserById } from "@/lib/supabase";
import { parseParamsSchema, parseQuerySchema } from "@/lib/validation";
import { basicPaginationSchema } from "@/schema/pagination";
import type { HonoParams } from "@/types/vars";
import { Hono } from "hono";
import { z } from "zod";

export const usersRoutes = new Hono<HonoParams>();

usersRoutes.get("/:id/plugins", async (c) => {
  const { page, per_page } = parseQuerySchema(c, basicPaginationSchema);
  const id = parseParamsSchema(c, z.string(), "id");

  const repos = await getPlugins(page, per_page, id);

  return jsonResponse.success(c, repos);
});

usersRoutes.get("/:id", async (c) => {
  const id = parseParamsSchema(c, z.string(), "id");

  const user = await getUserById(id);
  if (!user) {
    return jsonResponse.error(c, "User not found", "", 404);
  }

  return jsonResponse.success(c, user);
});
