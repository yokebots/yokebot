---
name: Create Meeting Agenda
description: Build structured meeting agendas from topics and objectives
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `create_meeting_agenda` tool to generate structured meeting agendas. Provide the topics and objectives, and it creates a timed agenda with discussion points, owners, and expected outcomes.

Keep meetings focused. Allocate time realistically and include buffer for discussion.

## Tools

```tools
[
  {
    "name": "create_meeting_agenda",
    "description": "Create a structured meeting agenda with timed items.",
    "parameters": {
      "type": "object",
      "properties": {
        "topics": { "type": "string", "description": "Topics to cover in the meeting" },
        "duration": { "type": "number", "description": "Meeting duration in minutes (default: 30)" },
        "objective": { "type": "string", "description": "The main goal of the meeting" },
        "attendees": { "type": "string", "description": "List of attendees and their roles (optional)" }
      },
      "required": ["topics"]
    }
  }
]
```
