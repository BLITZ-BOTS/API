import { jsonResponse } from "@/lib/response";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/middlewares/auth";
import type { HonoParams } from "@/types/vars";
import { Hono } from "hono";
import { z } from "zod";

export const projectRoutes = new Hono<HonoParams>();

const createProjectSchema = z.object({
  name: z.string(),
  host: z.string(),
  server_id: z.string(),
});

/* POST / - create a new project, follows createProjectSchema */
projectRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");

  const newProject = createProjectSchema.parse(await c.req.json());
  const supabase = getSupabase(c);

  const { data, error } = await supabase
    .from("profile")
    .upsert(
      {
        id: user.id,
        projects: [newProject],
      },
      {
        onConflict: "id",
        ignoreDuplicates: false,
      }
    )
    .select("projects")
    .single();

  if (error) {
    return jsonResponse.error(c, "Error updating profile", error.message, 500);
  }

  return jsonResponse.success(c, data);
});

/* DELETE /0 - delete project of index 0 */
projectRoutes.delete("/:index", requireAuth, async (c) => {
  const user = c.get("user");

  const index = z.coerce.number().parse(c.req.param("index"));
  const supabase = getSupabase(c);

  const { data: profile, error: fetchError } = await supabase
    .from("profile")
    .select("projects")
    .eq("id", user.id)
    .single();

  if (fetchError) {
    return jsonResponse.error(c, "Error fetching profile", fetchError.message, 500);
  }

  const currentProjects = profile?.projects || [];
  const referencedProject = currentProjects[index];
  const filteredProjects = currentProjects.filter((_: any, i: number) => i !== index);

  if (!referencedProject) {
    return jsonResponse.error(
      c,
      "Project not found",
      "The project you are trying to delete does not exist",
      404
    );
  }

  const { error } = await supabase
    .from("profile")
    .update({
      projects: filteredProjects,
    })
    .eq("id", user.id);

  if (error) {
    return jsonResponse.error(c, "Error updating projects", error.message, 500);
  }

  return jsonResponse.success(c, null);
});

projectRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  const supabase = getSupabase(c);
  const { data: profile, error: fetchError } = await supabase
    .from("profile")
    .select("projects")
    .eq("id", user.id)
    .single();

  if (fetchError) {
    return jsonResponse.error(c, "Error fetching profile", fetchError.message, 500);
  }

  return jsonResponse.success(c, profile?.projects || []);
});
