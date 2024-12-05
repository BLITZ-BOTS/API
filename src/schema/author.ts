import { z } from "zod";

export const authorSchema = z.object({
  username: z.string(),
  display_name: z.string(),
  id: z.string().uuid(),
  avatar_url: z.string().nullish().default(null),
});
