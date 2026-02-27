---
name: Slack Notify
description: Send messages and notifications to Slack channels via webhook
tags: [Channels]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `slack_send_message` tool to post notifications, alerts, or updates to a Slack channel. The message is sent via a configured incoming webhook URL.

Keep messages clear and actionable. Use Slack markdown formatting: `*bold*`, `_italic_`, `` `code` ``, and `>` for block quotes.

Requires the `SLACK_WEBHOOK_URL` environment variable to be configured on the engine.

## Tools

```tools
[
  {
    "name": "slack_send_message",
    "description": "Send a message to a Slack channel via incoming webhook.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The message text (supports Slack markdown)" },
        "username": { "type": "string", "description": "Override the bot username (optional)" }
      },
      "required": ["text"]
    }
  }
]
```
