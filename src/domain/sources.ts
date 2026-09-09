/**
 * domain/sources.ts — Job source types
 */

export type JobSource =
  | "remoteok"
  | "arbeitnow"
  | "findwork"
  | "remotive"
  | "freehire"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "linkedin"
  | "wellfound"
  | "manual";

export interface SourceConfig {
  name: string;
  enabled: boolean;
  baseUrl?: string;
  apiKey?: string;
}
