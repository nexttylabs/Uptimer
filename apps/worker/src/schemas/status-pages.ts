import { z } from 'zod';

const slugSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const idListSchema = z.array(z.number().int().positive()).min(1).max(500);

export const createStatusPageInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  is_public: z.boolean().optional().default(true),
  monitor_ids: idListSchema.optional().default([]),
});

export const patchStatusPageInputSchema = z
  .object({
    slug: slugSchema.optional(),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    is_public: z.boolean().optional(),
    monitor_ids: idListSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });
