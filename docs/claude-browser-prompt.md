# Prompt for Claude in Chrome: build the dashboard flows

Before you start: be signed in to https://make.powerautomate.com and https://onedrive.com with the account
that should own the flows (it must be a member of the **Service Desk** team). Then paste everything below
the line into Claude in Chrome.

---

You are building two Power Automate cloud flows for me in this browser. They export data from Microsoft Teams
to two JSON files in OneDrive. A wall dashboard reads those files, so the file names, the folder name and
the JSON shape must be **exactly** as described here.

## Facts

- Team: **Service Desk**
- Group chat (not a channel): **ServiceDesk internal Com**. The flow account must be a member of it.
- Schedule: the Shifts schedule of the Service Desk team, **all members' shifts** (never filter by user)
- OneDrive folder: **/CSJ Dashboard**
- Files: **shifts.json** and **teams.json**

## Rules

- I'm already signed in. If a sign-in, MFA or consent prompt appears, stop and ask me to handle it. Never type a password.
- Don't delete, edit or turn off any existing flow or file except the ones you create here.
- Use only standard connectors. If an action shows a **Premium** label, stop and tell me.
- Keep the default step names. The expressions below depend on them (spaces become `_`). If a step ends up
  with a different name, change the expressions to match.
- Enter every expression with the **fx / Expression** editor, not as plain text.
- If an action or field doesn't exist as described, don't guess. Stop and tell me what you see.

## Step 1: OneDrive placeholders

1. In OneDrive (My files), create the folder **CSJ Dashboard** if it doesn't exist.
2. In it, create **shifts.json** and **teams.json**, each containing just `{}`. If they already exist, leave
   them. (Tip: create them as text files, then rename them. Make sure the names don't end in `.txt`.)

## Step 2: Flow "Dashboard - Shifts"

Create a **Scheduled cloud flow** named `Dashboard - Shifts`, repeating every **15 minutes**.

1. **Shifts for Microsoft Teams → List all shifts**
   - Team: **Service Desk**
   - If there are start/end time filter fields, set the start to the expression `addDays(utcNow(), -7)` and
     the end to `addDays(utcNow(), 28)`. Leave every other filter empty, especially any user filter.
2. **Office 365 Groups → List group members**
   - Group Id: **Service Desk** (pick it from the list).
3. Check whether the Shifts connector has **List all time off** and **List all time off reasons**. If it does, add both for team
   **Service Desk**. If it doesn't, skip them and tell me at the end.
4. **Compose** (Data Operations). Set Inputs to this **single expression**:
   ```
   addProperty(addProperty(addProperty(json('{}'), 'generatedAt', utcNow()), 'members', body('List_group_members')?['value']), 'shifts', body('List_all_shifts')?['value'])
   ```
   If you added the time-off actions in step 3, use this instead:
   ```
   addProperty(addProperty(addProperty(addProperty(addProperty(json('{}'), 'generatedAt', utcNow()), 'members', body('List_group_members')?['value']), 'shifts', body('List_all_shifts')?['value']), 'timeOff', body('List_all_time_off')?['value']), 'timeOffReasons', body('List_all_time_off_reasons')?['value'])
   ```
5. **OneDrive for Business → Update file**
   - File: `/CSJ Dashboard/shifts.json`
   - File Content (expression): `string(outputs('Compose'))`
6. Save, then **Test → Manually** and run it.

### Check (required)

- Every step is green.
- Open the run and look at **List all shifts → Outputs**. The shifts must be an array under `value`, and each
  item must have `userId` and `sharedShift.startDateTime`. If the array is under another property name, change
  `?['value']` in the Compose expression to match and run again.
- **List group members → Outputs** contains people with `id` and `displayName`.
- Open `shifts.json` in OneDrive. It should start with `{"generatedAt":` and contain non-empty `members` and `shifts` arrays.
  It must **not** be a string in quotes (`"{\"generatedAt\"...`).
- The shifts belong to several different `userId`s, i.e. the whole team and not just me.

## Step 3: Flow "Dashboard - Teams"

Create a **Scheduled cloud flow** named `Dashboard - Teams`, repeating every **5 minutes**.

1. **Microsoft Teams → Send a Microsoft Graph HTTP request**, Method `GET`. First set the URI to
   `https://graph.microsoft.com/v1.0/me/chats?$filter=topic eq 'ServiceDesk internal Com'`, test-run, and copy
   `value[0].id` from the output (it looks like `19:...@thread.v2`). Then change the URI to:
   `https://graph.microsoft.com/v1.0/me/chats/<that id>/messages?$top=30&$orderby=createdDateTime desc`
2. **Compose**. Inputs (expression):
   ```
   addProperty(addProperty(addProperty(json('{}'), 'generatedAt', utcNow()), 'channel', 'ServiceDesk internal Com'), 'messages', body('Send_a_Microsoft_Graph_HTTP_request')?['value'])
   ```
3. **OneDrive for Business → Update file**
   - File: `/CSJ Dashboard/teams.json`
   - File Content (expression): `string(outputs('Compose'))`
4. Save, then **Test → Manually** and run it.

### Check (required)

- Every step is green.
- `teams.json` in OneDrive starts with `{"generatedAt":` and has a `messages` array. Each item has `createdDateTime`,
  `body.content` and `from.user.displayName`.

## When finished, report back

- Both flow names and whether they're **On**
- Whether time off was included (step 2.3) or skipped, and why
- Any expression you had to change, with the final version
- The first ~300 characters of each JSON file
