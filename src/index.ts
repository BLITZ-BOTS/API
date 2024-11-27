import { Hono } from "hono";
import { cors } from "hono/cors";
import { pluginsRoutes } from "@/routes/plugins";
import { ZodError } from "zod";
import { requireAuth } from "./middlewares/auth";
import { logger, loggerMiddleware } from "@/lib/logger";
import { getConnInfo } from "hono/bun";

const app = new Hono();
const isProd = Bun.env.NODE_ENV === "production";
const { PORT } = Bun.env;

/* we need to finish setting up cors */
app.use(
  cors({
    origin: "http://localhost:3000",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use("*", loggerMiddleware);

/* i couldnt get auth to work with dev so im just hoping it works */
if (isProd) app.use("*", requireAuth);

app.route("/plugins", pluginsRoutes);

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: err.errors }, 400);
  }

  logger.error(err);
  return c.text("Internal Server Error", 500);
});

Bun.serve({
  fetch: app.fetch,
  port: PORT ?? 3000,
});
