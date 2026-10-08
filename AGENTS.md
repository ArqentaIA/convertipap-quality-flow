# Architecture rules

- Report data reads must paginate in unique-key order and chunk large identifier filters, assembling every page before returning or exporting; transport limits must never become report totals.
- Report retrieval changes preserve existing weight sources, operational-day rules, plant authorization and export layouts; completeness fixes are not business-rule changes.