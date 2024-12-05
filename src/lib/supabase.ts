import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/config";
import type { Context } from "hono";
import { authorSchema } from "@/schema/author";

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

export async function getUserById(id: string) {
  const {
    data: { user },
    error,
  } = await supabase.auth.admin.getUserById(id);

  if (error || !user) {
    if (error?.status === 404) {
      return null;
    }
    throw error;
  }

  const metadata = user.user_metadata as {
    full_name: string;
    avatar_url?: string;
    custom_claims: {
      global_name?: string;
    };
  };

  const data = authorSchema.parse({
    id: user.id,
    username: metadata.full_name,
    display_name: metadata.custom_claims.global_name ?? metadata.full_name,
    avatar_url: metadata.avatar_url ?? null,
  });

  return data;
}
