---
name: Discord Manage
description: Post messages, manage channels, moderate, and welcome members
tags: [Channels]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [discord]
---

## Instructions

Use the `discord_manage` tool to manage Discord communities. Post messages, manage channels, moderate content, set up welcome flows, and handle member interactions via the Discord Bot API.

Maintain a welcoming community tone. Handle moderation actions with transparency and fairness.

## Tools

```tools
[
  {
    "name": "discord_manage",
    "description": "Manage Discord community via Bot API.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'send-message', 'list-channels', 'list-members', 'create-channel', 'pin-message', 'delete-message'" },
        "channelId": { "type": "string", "description": "Discord channel ID" },
        "content": { "type": "string", "description": "Message content (for send-message)" },
        "channelName": { "type": "string", "description": "Channel name (for create-channel)" },
        "messageId": { "type": "string", "description": "Message ID (for pin/delete)" },
        "guildId": { "type": "string", "description": "Server/guild ID" }
      },
      "required": ["action"]
    }
  }
]
```
