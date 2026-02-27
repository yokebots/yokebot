---
name: Discord Post
description: Post messages to Discord channels via webhook
tags: [Channels]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [discord]
---

## Instructions

Use the `discord_post` tool to send messages to Discord channels via webhook. Supports rich embeds with titles, descriptions, colors, and fields.

Keep messages clear and well-formatted. Use embeds for structured information.

## Tools

```tools
[
  {
    "name": "discord_post",
    "description": "Post a message to a Discord channel via webhook.",
    "parameters": {
      "type": "object",
      "properties": {
        "content": { "type": "string", "description": "Message text content" },
        "username": { "type": "string", "description": "Override the webhook bot username (optional)" },
        "embedTitle": { "type": "string", "description": "Embed title for rich formatting (optional)" },
        "embedDescription": { "type": "string", "description": "Embed description (optional)" },
        "embedColor": { "type": "number", "description": "Embed color as decimal integer (optional)" }
      },
      "required": ["content"]
    }
  }
]
```
