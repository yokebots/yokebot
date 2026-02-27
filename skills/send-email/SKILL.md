---
name: Send Email
description: Send emails with templates and formatting via Resend
tags: [Channels]
source: yokebot
version: 2.0.0
author: YokeBot
requiredCredentials: [resend]
---

## Instructions

Use the `send_email` tool to send transactional or notification emails via Resend. Compose professional emails with subject, body, and recipients. Supports HTML formatting.

Always confirm the recipient and content before sending. Never send emails without explicit user authorization.

## Tools

```tools
[
  {
    "name": "send_email",
    "description": "Send an email via Resend.",
    "parameters": {
      "type": "object",
      "properties": {
        "to": { "type": "string", "description": "Recipient email address" },
        "subject": { "type": "string", "description": "Email subject line" },
        "body": { "type": "string", "description": "Email body (supports HTML)" },
        "from": { "type": "string", "description": "Sender email (default: noreply@mail.yokebot.com)" },
        "replyTo": { "type": "string", "description": "Reply-to email address (optional)" }
      },
      "required": ["to", "subject", "body"]
    }
  }
]
```
