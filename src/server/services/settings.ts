import { eq } from "drizzle-orm";

import type { DB } from "@/db/client";
import { settings } from "@/db/schema";
import { settingsInputSchema } from "@/lib/validation";

export function getSettings(db: DB) {
  return db.select().from(settings).where(eq(settings.id, 1)).get()!;
}

export function updateSettings(db: DB, raw: unknown) {
  const input = settingsInputSchema.parse(raw);
  db.update(settings)
    .set({ ...input, updatedAt: Date.now() })
    .where(eq(settings.id, 1))
    .run();
  return getSettings(db);
}
