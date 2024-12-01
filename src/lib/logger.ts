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

export const loggerMiddleware = async (c: Context, next: () => Promise<void>) => {
  const start = performance.now();
  const {
    remote: { address },
  } = getConnInfo(c);

  await next();

  const responseTime = performance.now() - start;
  const method = `\x1b[1m${c.req.method}\x1b[0m`;
  const ip = `\x1b[36m${address}\x1b[0m`;
  const path = `\x1b[35m${new URL(c.req.url).pathname}\x1b[0m`;
  const status = c.res.ok
    ? `\x1b[32m${c.res.status}\x1b[0m`
    : `\x1b[31m${c.res.status}\x1b[0m`;
  const timing = `\x1b[33m${responseTime.toFixed(2)}ms\x1b[0m`;

  const str = `${method} ${ip} ${path} ${status} ${timing}`;

  if (c.res.ok) {
    logger.info(str);
  } else {
    logger.warn(str);
  }
};
