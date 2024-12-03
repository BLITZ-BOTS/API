import { jsonResponse } from "@/lib/response";
import { getSupabase } from "@/lib/supabase";
import { parseJsonSchema } from "@/lib/validation";
import { requireAuth } from "@/middlewares/auth";
import type { HonoParams } from "@/types/vars";
import { Hono } from "hono";
import { z } from "zod";

export const userRoutes = new Hono<HonoParams>();

/* POST / - change pella key, needs { pella_api_key: string } */
userRoutes.post("/pella_key", requireAuth, async (c) => {
  const { pella_api_key } = await parseJsonSchema(
    c,
    z.object({ pella_api_key: z.string() })
  );

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
