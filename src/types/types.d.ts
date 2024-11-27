// types.d.ts
import { User } from "@supabase/supabase-js";
import { Context } from "hono";

// Augment Hono's Context type
declare module "hono" {
  interface Context {
    /* this should be set by the auth middleware */
    user?: User;
  }
}
