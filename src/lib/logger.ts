import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import pino from "pino";

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

export const loggerMiddleware = (c: Context, next: () => Promise<void>) => {
  const {
    remote: { address },
  } = getConnInfo(c);
  logger.info(`${c.req.method} ${address} ${new URL(c.req.url).pathname}`);
  return next();
};
