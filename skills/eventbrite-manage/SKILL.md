---
name: Eventbrite Manage
description: Create events, track RSVPs, and manage attendees via Eventbrite
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [eventbrite]
---

## Instructions

Use the `eventbrite_manage` tool to manage events on Eventbrite. Create new events, list attendees, track RSVPs, and send attendee updates.

Include all essential event details when creating. Track registration numbers for capacity planning.

## Tools

```tools
[
  {
    "name": "eventbrite_manage",
    "description": "Manage events and attendees on Eventbrite.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'list-events', 'create-event', 'list-attendees', 'get-event'" },
        "eventName": { "type": "string", "description": "Event name (for create)" },
        "description": { "type": "string", "description": "Event description (for create)" },
        "startDate": { "type": "string", "description": "Event start in ISO 8601 (for create)" },
        "endDate": { "type": "string", "description": "Event end in ISO 8601 (for create)" },
        "venue": { "type": "string", "description": "Venue name or 'online' (for create)" },
        "capacity": { "type": "number", "description": "Max attendees (for create)" },
        "eventId": { "type": "string", "description": "Event ID (for list-attendees, get-event)" }
      },
      "required": ["action"]
    }
  }
]
```
