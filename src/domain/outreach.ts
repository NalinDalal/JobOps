/**
 * domain/outreach.ts — Outreach types
 */

export interface OutreachGroup {
  company: string;
  roles: string[];
  roleCount: number;
  peopleSearchUrls: PeopleSearchUrl[];
  outreachBlurb?: string;
}

export interface PeopleSearchUrl {
  title: string;
  url: string;
}

export interface OutreachConfig {
  short_dm?: string;
  long_dm?: string;
  linkedin_titles?: string[];
}
