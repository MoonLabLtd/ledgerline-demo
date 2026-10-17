import { z } from "zod";

import { readJson, withDb } from "@/server/api";
import { seedDemoData } from "@/server/demo-seed";
import { removeDemoData } from "@/server/services/maintenance";

const demoActionSchema = z.strictObject({
  action: z.enum(["seed", "remove"]),
});

export async function POST(request: Request): Promise<Response> {
  return withDb(async (db) => {
    const { action } = demoActionSchema.parse(await readJson(request));
    if (action === "seed") {
      return Response.json(seedDemoData(db));
    }
    return Response.json(removeDemoData(db));
  });
}
