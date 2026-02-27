---
name: Write Press Release
description: Draft press releases from key facts and announcements
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `write_press_release` tool to create professional press releases following AP style. Provide the announcement details and the tool generates a complete release with headline, dateline, lead paragraph, body, and boilerplate.

Follow the inverted pyramid structure. Lead with the most newsworthy information.

## Tools

```tools
[
  {
    "name": "write_press_release",
    "description": "Draft a professional press release from key facts.",
    "parameters": {
      "type": "object",
      "properties": {
        "announcement": { "type": "string", "description": "The news or announcement to cover" },
        "companyName": { "type": "string", "description": "Company or organization name" },
        "quotes": { "type": "string", "description": "Optional quotes to include from spokespersons" },
        "boilerplate": { "type": "string", "description": "Company boilerplate/about paragraph (optional)" }
      },
      "required": ["announcement", "companyName"]
    }
  }
]
```
