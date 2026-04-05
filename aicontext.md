# Project Context — Rent Tracker

## Infrastructure
- **GitHub Repository**: `https://github.com/arunvikramn/rentout`
- **Google Sheet ID**: `1DX7AXCFs0-MjLcAImLxWP_Nau936Ry5dMDDgPrrZVkU`
- **Google Apps Script ID**: `1EWkEQ-oLqolkU1mjgKj9fhNw0wd5AElgdo1k2DSTUM38gMPs4d_sG2WK`
- **Web App URL**: `https://script.google.com/macros/s/AKfycbyiP4CI68H9H97ROtdjTPGCiwlrnYLcIy7e2Mo7xO6o0-lulqS8AMSMC-9z3GALwNcXqw/exec`

## Local Setup
- **Clasp Config**: `.clasp.json` (root)
- **Primary Script**: `config.gs`
- **Tenant UI**: `index.html`

## Commands
- **Sync to GAS**: `clasp push`
- **Fetch from GAS**: `clasp pull`
- **Deploy/Push to GitHub**: `git add . ; git commit -m "update" ; git push`

## Sheet Data (Initial)
| unit_id | unit_name | start_date | base_rent | escalation_pct | escalation_min_flat |
|---|---|---|---|---|---|
| ground | Ground Floor | 2026-04-01 | 11000 | 5 | 1000 |
| first | First Floor | 2026-04-01 | 12000 | 5 | 1000 |

