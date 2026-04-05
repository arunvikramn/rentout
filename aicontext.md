# Project Context — Rent Tracker

## 1. Infrastructure
- **GitHub**: [arunvikramn/rentout](https://github.com/arunvikramn/rentout)
- **Sheet ID**: `1DX7AXCFs0-MjLcAImLxWP_Nau936Ry5dMDDgPrrZVkU`
- **Script ID**: `1EWkEQ-oLqolkU1mjgKj9fhNw0wd5AElgdo1k2DSTUM38gMPs4d_sG2WK`
- **Live URL**: [Web App](https://script.google.com/macros/s/AKfycbyiP4CI68H9H97ROtdjTPGCiwlrnYLcIy7e2Mo7xO6o0-lulqS8AMSMC-9z3GALwNcXqw/exec)

## 2. Technical Specs
- **Backend**: `config.gs` (Google Apps Script)
- **Frontend**: `index.html` (Single-page app)
- **Tooling**: `clasp` for local development & deployment.
- **Manifest**: `appsscript.json` (defines access & execution context).

## 3. Operations & Workflows
| Task | Command |
| :--- | :--- |
| **Sync local to GAS** | `clasp push -f` |
| **Update Live App** | `clasp deploy -i AKfycbyiP4CI68H9H97ROtdjTPGCiwlrnYLcIy7e2Mo7xO6o0-lulqS8AMSMC-9z3GALwNcXqw` |
| **Save to GitHub** | `git add . ; git commit -m "update" ; git push` |
| **One-Click Deploy** | `clasp push -f ; clasp deploy -i AKfycbyiP4CI68H9H97ROtdjTPGCiwlrnYLcIy7e2Mo7xO6o0-lulqS8AMSMC-9z3GALwNcXqw ; git push` |

## 4. Business Rules
- **Units**: Ground (₹11,000), First (₹12,000).
- **Escalation**: 5% or ₹1,000 min annually.
- **Late Fee**: ₹100/day after 3-day grace.
- **Roles**: 
  - **Tenant**: Access via `?unit=ground` or `?unit=first`.
  - **Owner**: Access via `?view=owner` (allows payment verification).

## 5. Critical Knowledge
- **Anonymous Access**: Manifest must have `"access": "ANYONE_ANONYMOUS"`.
- **Clasp Sync**: `index.html` requires `!index.html` in `.claspignore`.
- **Execution Mode**: `USER_DEPLOYING` = "Execute as Me".

