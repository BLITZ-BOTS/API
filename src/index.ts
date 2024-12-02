import { Hono } from "hono";
import { cors } from "hono/cors";
import { pluginsRoutes } from "@/routes/plugins";
import { ZodError } from "zod";
import { logger, loggerMiddleware } from "@/lib/logger";
import { projectRoutes } from "./routes/projects";
import { userRoutes } from "./routes/user";
import { jsonResponse } from "./lib/response";

const app = new Hono();
const { PORT } = Bun.env;

/* we need to finish setting up cors */
app.use(
  cors({
    origin: ["http://localhost:5173", "https://www.blitz-bots.com"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use("*", loggerMiddleware);

app.route("/plugins", pluginsRoutes);
app.route("/user", userRoutes);
app.route("/projects", projectRoutes);

app.onError((err, c) => {
  if (err instanceof ZodError) {
    const zodErrorsString = err.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    return jsonResponse.error(c, "Invalid body", zodErrorsString, 400);
  }

  logger.error(err);
  return jsonResponse.error(c, err.name, err.message, 500);
});

Bun.serve({
  fetch: app.fetch,
  port: PORT ?? 3000,
});
