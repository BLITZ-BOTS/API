import { jsonResponse } from "@/lib/response";
import { getSupabase } from "@/lib/supabase";
import { Hono } from "hono";
import { z } from "zod";

export const userRoutes = new Hono();

userRoutes.post("/pella_key", async (c) => {
  /* this wont be needed in prod */
  if (!c.user) {
    return jsonResponse.error(c, "Unauthorized", "You must be logged in to do this", 401);
  }

  const body = (await c.req.json()) as { pella_api_key?: string };
  const pella_api_key = z.string().parse(body.pella_api_key);

  const supabase = getSupabase(c);

  const { error } = await supabase.from("profile").upsert({
    id: c.user.id,
    pella_api_key,
  });

  if (error) {
    return jsonResponse.error(c, "Error updating profile", error.message, 500);
  }

  return jsonResponse.success(c, null, 200);
});
