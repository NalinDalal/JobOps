# Pipeline

Jobs discovered but not yet evaluated. Add URLs here for batch processing.

| # | URL | Source | Added |
|---|-----|--------|-------|

## Notes

- **`config/companies.yml` removed (2026-08-16):** it was listed as part of
  the config surface but no script ever read it. Company filtering lives
  solely in `config/portals.yml` (`blacklist` / `whitelist`), which
  `scan.mjs` enforces. Career-page company data (domain, careers URL) is
  kept in `config/portals.yml` board lists when relevant.
