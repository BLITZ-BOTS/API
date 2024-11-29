import type { MiddlewareHandler } from "hono";
import { supabase } from "@/lib/supabase";
import { jsonResponse } from "@/lib/response";
import { jwt } from "hono/jwt";
import { SUPABASE_JWT_SECRET } from "@/config";
import { every } from "hono/combine";

/**
 * auth users using supabase
 */
const requireAuthRaw: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse.error(
      c,
      "Unauthorized",
      "Missing or invalid authorization header",
      401
    );
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return jsonResponse.error(
        c,
        "Unauthorized",
        "Invalid token or user not found",
        401
      );
    }

    /* send user to the obj */
    c.set("user", data.user);

    /* success! */
    await next();
  } catch (err) {
    return jsonResponse.error(c, "Unauthorized", "Invalid or expired token", 401);
  }
};

export const requireAuth = every(
  jwt({
    secret: SUPABASE_JWT_SECRET,
  }),
  requireAuthRaw
);
