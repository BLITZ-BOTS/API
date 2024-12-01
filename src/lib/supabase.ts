import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/config";
import type { Context } from "hono";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
export const getSupabase = (context: Context) => {
  const authHeader = context.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No authorization header");
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
};
