import z from "zod";

export const basicPaginationSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  per_page: z.coerce.number().min(1).max(100).optional().default(100),
});
