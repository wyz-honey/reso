import { eq } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { resoClientSettings } from '~/database/schema.ts';

const SETTINGS_ROW_ID = 'default';

export type ResoClientSettingsRow = {
  voiceSettings: Record<string, unknown>;
  modelProviders: Record<string, unknown>;
  updatedAt: Date;
};

export async function getResoClientSettingsRow(db: AppDb): Promise<ResoClientSettingsRow | null> {
  const [row] = await db
    .select({
      voiceSettings: resoClientSettings.voiceSettings,
      modelProviders: resoClientSettings.modelProviders,
      updatedAt: resoClientSettings.updatedAt,
    })
    .from(resoClientSettings)
    .where(eq(resoClientSettings.id, SETTINGS_ROW_ID));
  if (!row) return null;
  return {
    voiceSettings: (row.voiceSettings as Record<string, unknown>) || {},
    modelProviders: (row.modelProviders as Record<string, unknown>) || {},
    updatedAt: row.updatedAt,
  };
}

export async function upsertResoClientSettingsRow(
  db: AppDb,
  payload: { voiceSettings: Record<string, unknown>; modelProviders: Record<string, unknown> }
): Promise<void> {
  await db
    .insert(resoClientSettings)
    .values({
      id: SETTINGS_ROW_ID,
      voiceSettings: payload.voiceSettings,
      modelProviders: payload.modelProviders,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [resoClientSettings.id],
      set: {
        voiceSettings: payload.voiceSettings,
        modelProviders: payload.modelProviders,
        updatedAt: new Date(),
      },
    });
}
