import "server-only";

import { connection } from "next/server";
import { z } from "zod";

import { DatabaseInitError, type DB } from "@/db/client";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";

export function errorResponse(e: unknown): Response {
  if (e instanceof z.ZodError) {
    return Response.json(
      {
        error: e.issues[0]?.message ?? "Invalid input",
        issues: e.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
      { status: 400 },
    );
  }

  if (e instanceof AppError) {
    return Response.json({ error: e.message }, { status: e.status });
  }

  if (e instanceof DatabaseInitError) {
    console.error(e);
    return Response.json({ error: e.message, dbFile: e.dbFile }, { status: 503 });
  }

  console.error(e);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}

export async function withDb(fn: (db: DB) => Response | Promise<Response>): Promise<Response> {
  await connection();
  try {
    return await fn(getDb());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "Request body must be valid JSON");
  }
}
