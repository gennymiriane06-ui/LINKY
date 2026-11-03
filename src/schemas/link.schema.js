import { z } from 'zod';

export const createLinkSchema = z.object({
  target_url: z.string().url().max(2048).refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, 'Only HTTP and HTTPS URLs are allowed'),

  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{3,16}$/)
    .optional(),

  expires_at: z.string().datetime({ offset: true }).optional(),
});
