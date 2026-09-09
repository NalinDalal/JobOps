/**
 * schemas/config.ts — Zod schema for configuration validation
 */

import { z } from "zod";

export const SearchConfigSchema = z.object({
  include_titles: z.array(z.string()),
  exclude_titles: z.array(z.string()),
  locations: z.array(z.string()),
  allow_remote: z.boolean(),
  max_age_days: z.number(),
  score_threshold: z.number().min(0).max(5),
  max_per_digest: z.number().min(1),
  portals: z.object({
    api_portals: z.boolean(),
    greenhouse: z.boolean(),
    lever: z.boolean(),
    ashby: z.boolean(),
    linkedin: z.boolean(),
    instahyre: z.boolean(),
    wellfound: z.boolean(),
  }),
  query_mode: z.enum(["auto", "custom"]),
  custom_query: z.string(),
  mock_mode: z.boolean(),
});

export type SearchConfigInput = z.infer<typeof SearchConfigSchema>;

export const PortalEntrySchema = z.object({
  name: z.string(),
  url: z.string(),
  enabled: z.boolean().optional(),
});

export const PortalsConfigSchema = z.object({
  greenhouse: z.array(PortalEntrySchema),
  lever: z.array(PortalEntrySchema),
  ashby: z.array(PortalEntrySchema),
  blacklist: z.object({
    enabled: z.boolean(),
    companies: z.array(z.string()),
  }).optional(),
  whitelist: z.object({
    enabled: z.boolean(),
    companies: z.array(z.string()),
  }).optional(),
});

export type PortalsConfigInput = z.infer<typeof PortalsConfigSchema>;
