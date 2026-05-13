import { z } from 'zod';

export const layerSchema = z.object({
  id: z.string().default('layer'),
  videoAsset: z.string().default(''),
  blendMode: z.string().optional(),
  durationMs: z.number().optional(),
});

export type LayerInput = z.infer<typeof layerSchema>;
