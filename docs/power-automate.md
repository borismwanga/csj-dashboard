# Power Automate feeds

> To have Claude in Chrome build these flows for you, paste [claude-browser-prompt.md](claude-browser-prompt.md) into it.

Two scheduled cloud flows write JSON files into a OneDrive/SharePoint folder. That folder is synced to the
dashboard PC, and the app reads the files from disk. Only standard connectors are used (no Premium licence),
and nothing needs to reach into the internal network.

```
Shifts ─┐                                      ┌─ /api/schedule ─┐
        ├─ flows ─► OneDrive "CSJ Dashboard" ─sync─► FEED_DIR ─┤                 ├─ dashboard
Teams ──┘          shifts.json / teams.json        └─ /api/teams ────┘
```

The flows write the **raw** connector output; all cleanup (names, local times, HTML stripping, filtering)
happens in the app (`lib/schedule.ts` → `fromShiftsFeed`, `lib/teams.ts` → `fromChannelFeed`).

## 0. Preparation

- Build the flows with an account that is a member of the team (ideally a service account, so the flows
  don't break when someone leaves).
- In that account's OneDrive, create a folder `CSJ Dashboard` and upload two placeholder files,
  `shifts.json` and `teams.json`, each containing `{}`. (The flows use **Update file**, which needs the
  file to exist.)

## 1. Flow "Dashboard – Shifts" (Scheduled cloud flow, every 15 min)

1. **Recurrence**: every 15 minutes.
2. **Shifts for Microsoft Teams → List all shifts**: team **Service Desk** (all members' shifts, no user filter). If it offers start/end filters, use
   `addDays(utcNow(), -7)` and `addDays(utcNow(), 21)`.
3. *(Optional, for time off)* **Shifts → List all time off** and **List all time off reasons**, same team.
   If your connector doesn't have these, skip them; the dashboard just won't show time off.
4. **Office 365 Groups → List group members**: Group Id = the same team (team ID = group ID).
   This provides the names, since shifts only contain user IDs.
5. **Compose**: Inputs = this single expression (fx editor):
   ```
   addProperty(addProperty(addProperty(json('{}'), 'generatedAt', utcNow()), 'members', body('List_group_members')?['value']), 'shifts', body('List_all_shifts')?['value'])
   ```
   With time off, wrap two more: `addProperty(addProperty(<above>, 'timeOff', body('List_all_time_off')?['value']), 'timeOffReasons', body('List_all_time_off_reasons')?['value'])`.
   Action names in expressions are the step names with `_` for spaces; adjust them if you renamed steps.
6. **OneDrive for Business → Update file**: File = `/CSJ Dashboard/shifts.json`,
   File Content = `string(outputs('Compose'))`.

## 2. Flow "Dashboard – Teams" (Scheduled cloud flow, every 5 min)

The source is the group chat **ServiceDesk internal Com** (not a channel). The standard Teams connector has no
"get chat messages" action, so this uses its **Send a Microsoft Graph HTTP request** action (standard, preview).
The flow account must be a **member of the chat**.

**Find the chat ID once.** Make a throwaway flow (or a temporary step) with **Microsoft Teams → Send a Microsoft
Graph HTTP request**, Method `GET`, URI:
```
https://graph.microsoft.com/v1.0/me/chats?$filter=topic eq 'ServiceDesk internal Com'
```
Run it. In the output, `value[0].id` looks like `19:abc123...@thread.v2`. Copy it. (The **List chats** action
also shows each chat's `id` next to its `topic`.)

1. **Recurrence**: every 5 minutes.
2. **Microsoft Teams → Send a Microsoft Graph HTTP request**: Method `GET`, URI (paste your chat ID):
   ```
   https://graph.microsoft.com/v1.0/me/chats/19:YOUR-CHAT-ID@thread.v2/messages?$top=30&$orderby=createdDateTime desc
   ```
3. **Compose**: Inputs (expression):
   ```
   addProperty(addProperty(addProperty(json('{}'), 'generatedAt', utcNow()), 'channel', 'ServiceDesk internal Com'), 'messages', body('Send_a_Microsoft_Graph_HTTP_request')?['value'])
   ```
4. **OneDrive for Business → Update file**: File = `/CSJ Dashboard/teams.json`,
   File Content = `string(outputs('Compose'))`.

The dashboard shows the 8 newest messages, skipping system messages (people added/removed, renames) and deleted
ones. Everything in this chat ends up on a wall screen, so make sure the chat members know that.

## 3. Flow "Dashboard – Photos" (Scheduled cloud flow, once a day)

Profile pictures for the chat and the schedule. People without a photo show their initials.
Create a placeholder `photos.json` containing `[]` in the `CSJ Dashboard` folder first.

1. **Recurrence**: every 1 day (e.g. 06:00).
2. **Initialize variable**: Name `photos`, Type **Array**, Value `[]`.
3. **Office 365 Groups → List group members**: Group Id = **Service Desk**.
4. **Apply to each**: input = `value` of *List group members*. Inside it:
   1. **Office 365 Users → Get user photo (V2)**: User (UPN) = expression `items('Apply_to_each')?['id']`.
      If it has an *Image size* option, pick **96x96** (keeps the file small).
   2. **Append to array variable**: Name `photos`, Value (expression):
      ```
      addProperty(addProperty(json('{}'), 'id', items('Apply_to_each')?['id']), 'photo', body('Get_user_photo_(V2)'))
      ```
5. **OneDrive for Business → Update file**: File = `/CSJ Dashboard/photos.json`,
   File Content = `string(variables('photos'))`.
   Open this step's **⋯ → Settings / Configure run after** and tick both **is successful** and **has failed**.
   People without a photo make *Get user photo* fail, and the file should still be written for everyone else.

Check: `photos.json` starts with `[{"id":"…","photo":{"$content-type":"image/jpeg","$content":"/9j/…` (or `"photo":"/9j/…"`; the
app accepts both).

## 3b. Flow "Dashboard – Onboarding" (shared calendar)

Writes today's events of the shared **Onboarding appointments** calendar to `onboarding.json`:
`{"generatedAt": …, "calendar": "Onboarding appointments", "events": [ …raw Outlook events… ]}`
(e.g. **Office 365 Outlook → Get calendar view of events (V3)** for today, then Compose + Update file as above).

The schedule slide shows today's events in a strip under the grid: time, person and title (+ ticket key).
Only `subject`, `start`/`end` (`startWithTimeZone`) and `isAllDay` are used. Subjects are read as
`Type | Last, First | ITCSJ-12345` or `Onboarding appointment - Name`. The event **body is never shown**
(Bookings puts e-mail addresses in it). Missing or broken file: the strip is simply not shown.

## 4. Dashboard PC

1. Sign in to OneDrive with the flow account (or sync/shortcut the shared folder), and set
   `CSJ Dashboard` to **Always keep on this device**.
2. Point the app at it and start it:
   ```powershell
   $env:FEED_DIR = "C:\Users\<user>\OneDrive - <Org>\CSJ Dashboard"
   npm run build; npm start
   ```

| Variable | Default | Meaning |
|---|---|---|
| `FEED_DIR` | `./data` | Folder containing `shifts.json` / `teams.json` |
| `FEED_MAX_AGE_MIN` | `60` | A file older than this (by its `generatedAt`) shows "⚠ data may be outdated" |
| `TZ` | system | Time zone used to display shift times (feed times are UTC) |

## Behaviour

- `shifts.json` missing → the schedule falls back to the newest Excel export in `./data`.
- `onboarding.json` missing → no appointments strip.
- `photos.json` missing, or no photo for someone → initials are shown.
- `teams.json` missing → the Teams slide shows mock data with a "mock data" badge.
- File half-synced / invalid JSON → the API returns 500 and the screen keeps the last good data, flagged as outdated.
- Only **published** shifts are shown (`sharedShift`); unpublished edits (`draftShift`) are ignored.
- If someone has a shift and time off on the same day, the time off is shown.
