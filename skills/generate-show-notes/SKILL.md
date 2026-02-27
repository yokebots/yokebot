---
name: Generate Show Notes
description: Create podcast show notes from transcripts with timestamps
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_show_notes` tool to create podcast show notes from a transcript. It generates a title, summary, key topics discussed, guest bios, timestamps for segments, and links mentioned.

Make show notes scannable with clear timestamps and topic headers.

## Tools

```tools
[
  {
    "name": "generate_show_notes",
    "description": "Create podcast show notes from a transcript.",
    "parameters": {
      "type": "object",
      "properties": {
        "transcript": { "type": "string", "description": "The podcast episode transcript" },
        "showName": { "type": "string", "description": "Name of the podcast (optional)" },
        "guestInfo": { "type": "string", "description": "Guest name and bio details (optional)" }
      },
      "required": ["transcript"]
    }
  }
]
```
