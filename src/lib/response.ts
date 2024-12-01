export interface ErrorJson {
  error: string;
  message: string;
}

export interface SuccessJson<T> {
  data: T;
}

export type JsonResponse<T> = ErrorJson | SuccessJson<T>;

import type { Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";

export const jsonResponse = {
  success: <T>(c: Context, data: T, status: number = 200) =>
    c.json<SuccessJson<T>>({ data }, status as StatusCode),

  error: (c: Context, error: string, message: string, status = 400) =>
    c.json<ErrorJson>({ error, message }, status as StatusCode),
};
