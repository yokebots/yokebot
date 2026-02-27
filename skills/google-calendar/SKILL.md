---
name: Google Calendar
description: List, create, and update calendar events via Google Calendar API
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google]
---

## Instructions

Use the `google_calendar_list` tool to manage Google Calendar events. List upcoming events, create new ones, or update existing events with attendees, descriptions, and reminders.

Always confirm dates and times with the user before creating events. Include time zones for clarity.

## Tools

```tools
[
  {
    "name": "google_calendar_list",
    "description": "Manage Google Calendar events.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'list', 'create', 'update', 'delete'" },
        "timeMin": { "type": "string", "description": "Start of time range in ISO 8601 (for list)" },
        "timeMax": { "type": "string", "description": "End of time range in ISO 8601 (for list)" },
        "summary": { "type": "string", "description": "Event title (for create/update)" },
        "description": { "type": "string", "description": "Event description (for create/update)" },
        "start": { "type": "string", "description": "Event start time in ISO 8601 (for create/update)" },
        "end": { "type": "string", "description": "Event end time in ISO 8601 (for create/update)" },
        "attendees": { "type": "string", "description": "Comma-separated attendee email addresses (for create/update)" },
        "eventId": { "type": "string", "description": "Event ID (for update/delete)" }
      },
      "required": ["action"]
    }
  }
]
```
