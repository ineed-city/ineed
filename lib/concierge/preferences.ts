import { z } from 'zod';

export const PreferencePatch = z.object({
  language: z.enum(['en', 'ro']).optional(),
  city: z.string().trim().max(100).optional(),
}).strict().refine(value => value.language !== undefined || value.city !== undefined);

export function readPreferences(metadata: Record<string, unknown> = {}) {
  return {
    language: metadata.ineed_language === 'ro' ? 'ro' as const : 'en' as const,
    city: typeof metadata.ineed_city === 'string' ? metadata.ineed_city.slice(0, 100) : '',
    locationConfigured: metadata.ineed_location_configured === true,
  };
}
export function preferenceMetadata(patch: z.infer<typeof PreferencePatch>) {
  return {
    ...(patch.language !== undefined ? { ineed_language: patch.language } : {}),
    ...(patch.city !== undefined ? { ineed_city: patch.city, ineed_location_configured: true } : {}),
  };
}
