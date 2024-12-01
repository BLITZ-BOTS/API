import type { User } from "@supabase/supabase-js";

type Variables = {
  user: User;
};

export type HonoParams = {
  Variables: Variables;
};
