import { jsonResponse } from "@/lib/response";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/middlewares/auth";
import type { HonoParams } from "@/types/vars";
import { Hono } from "hono";
import { z } from "zod";

export const userRoutes = new Hono<HonoParams>();

/* POST / - change pella key, needs { pella_api_key: string } */
userRoutes.post("/pella_key", requireAuth, async (c) => {
  const body = (await c.req.json()) as { pella_api_key?: string };
  const pella_api_key = z.string().parse(body.pella_api_key);

  const supabase = getSupabase(c);

  const { error } = await supabase.from("profile").upsert({
    id: c.get("user").id,
    pella_api_key,
  });

  if (error) {
    return jsonResponse.error(c, "Error updating profile", error.message, 500);
  }

  return jsonResponse.success(c, null, 200);
});
