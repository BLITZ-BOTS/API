import type { Context } from "hono";
import { z, ZodError } from "zod";

export class RequestValidationError extends Error {
  zodError: ZodError;

  constructor(zodError: ZodError) {
    super(zodError.message);
    this.zodError = zodError;
    this.name = "RequestValidationError";
  }
}

export async function parseBodySchema<T extends z.ZodTypeAny>(
  c: Context,
  schema: T
): Promise<z.infer<T>> {
  try {
const b = await c.req.parseBody();
if (b.tags) b.tags = b.tags.split(",");
    return schema.parse(b) as z.infer<T>;
  } catch (e) {
    if (e instanceof ZodError) {
      throw new RequestValidationError(e);
    }
  }
}

export async function parseJsonSchema<T extends z.ZodTypeAny>(
  c: Context,
  schema: T
): Promise<z.infer<T>> {
  try {
    return schema.parse(await c.req.json()) as z.infer<T>;
  } catch (e) {
    if (e instanceof ZodError) {
      throw new RequestValidationError(e);
    }
  }
}

export function parseQuerySchema<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
  paramName?: string
): z.infer<T> {
  try {
    if (paramName) {
      return schema.parse(c.req.query(paramName)) as z.infer<T>;
    }

    return schema.parse(c.req.query()) as z.infer<T>;
  } catch (e) {
    if (e instanceof ZodError) {
      throw new RequestValidationError(e);
    }
  }
}

export function parseParamsSchema<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
  paramName?: string
): z.infer<T> {
  try {
    if (paramName) {
      return schema.parse(c.req.param(paramName)) as z.infer<T>;
    }

    return schema.parse(c.req.param()) as z.infer<T>;
  } catch (e) {
    if (e instanceof ZodError) {
      throw new RequestValidationError(e);
    }
  }
}
