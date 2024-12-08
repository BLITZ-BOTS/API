import { Hono } from "hono";
import { cors } from "hono/cors";
import { pluginsRoutes } from "@/routes/plugins";
import { logger, loggerMiddleware } from "@/lib/logger";
import { projectRoutes } from "./routes/projects";
import { userRoutes } from "./routes/user";
import { jsonResponse } from "./lib/response";
import { supabase } from "./lib/supabase";
import { RequestValidationError } from "./lib/validation";
import { usersRoutes } from "./routes/users";

const app = new Hono();
const { PORT } = Bun.env;

/* we need to finish setting up cors */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:1420",
      "https://www.blitz-bots.com",
    ],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use("*", loggerMiddleware);

app.route("/plugins", pluginsRoutes);
app.route("/user", userRoutes);
app.route("/users", usersRoutes);
app.route("/projects", projectRoutes);

app.get("/login", async (c) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
  });

  if (error) {
    console.error("Error generating OAuth URL:", error.message);
    return c.text("Failed to generate login URL", 400);
  }

  return c.redirect(data.url, 302);
});

app.onError((err, c) => {
  if (err instanceof RequestValidationError) {
    const zodErrorsString = err.zodError.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    return jsonResponse.error(c, "Invalid body", zodErrorsString, 400);
  }

  logger.error(err);
  return jsonResponse.error(c, err.name, err.message, 500);
});

app.notFound((c) => {
  return jsonResponse.error(
    c,
    "Not found",
    "Route was not found (or you're using the wrong method)",
    404
  );
});

Bun.serve({
  fetch: app.fetch,
  idleTimeout: 255,
  port: PORT ?? 3000,
});
