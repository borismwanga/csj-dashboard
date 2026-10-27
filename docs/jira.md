# Jira Cloud

The app calls the Jira Cloud REST API from the server (`lib/jira.ts`) every 60 s. Until the settings
below are filled in, the two Jira slides show mock data with a "mock data" badge.

## 1. API token

1. Sign in to Jira with the account the dashboard should use (ideally a read-only service account that can
   see the service desk project).
2. Go to https://id.atlassian.com/manage-profile/security/api-tokens → **Create API token**.
   Name it `CSJ dashboard`. Tokens expire (max. 1 year), so note the date and renew it before then.

## 2. `.env.local`

```
JIRA_BASE_URL=https://<your-site>.atlassian.net
JIRA_EMAIL=<account e-mail>
JIRA_API_TOKEN=<token>
JIRA_JQL=project = ITCSJ
JIRA_RESOLVED_DAYS=30
```

`.env.local` is git-ignored. Never commit the token.

## 3. Find the right filter

```
node scripts/jira-check.mjs            # all projects
node scripts/jira-check.mjs service    # projects matching "service"
```

It checks the login, lists projects (key + name) and team-like fields, and shows how many open tickets
`JIRA_JQL` matches. `JIRA_JQL` is any JQL **without ORDER BY**, for example:

| Goal | JQL |
|---|---|
| One project | `project = ITCSJ` |
| Only the Service Desk team | `project = ITCSJ AND "Team[Team]" = "Service Desk"` (field name from the script output) |
| Tickets assigned to an AD/Jira group | `project = ITCSJ AND assignee in membersOf("servicedesk")` |

Try a JQL in Jira's issue search first. Once it shows the right tickets there, copy it into `.env.local`.

## What is shown

**Jira tickets**
- Tiles: open tickets per status (To Do statuses first, then In Progress), **Unassigned** (orange when > 0)
  and **Resolved today**.
- The 10 most urgent open tickets: highest priority first, then oldest. Unassigned is highlighted.

**Jira team**
- Open tickets per agent.
- Tickets solved per agent in the last `JIRA_RESOLVED_DAYS` days (by assignee at resolution).

If Jira returns an error (bad token, bad JQL), the slide keeps the last good data and shows "⚠ data may be
outdated". Open http://localhost:3000/api/jira to see the exact error.
