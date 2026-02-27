---
name: Send Email
description: Send emails with templates and formatting via SendGrid
tags: [Channels]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [sendgrid]
---

## Instructions

Use the `send_email` tool to send transactional or notification emails via SendGrid. Compose professional emails with subject, body, and recipients. Supports HTML formatting.

Always confirm the recipient and content before sending. Never send emails without explicit user authorization.

## Tools

```tools
[
  {
    "name": "send_email",
    "description": "Send an email via SendGrid.",
    "parameters": {
      "type": "object",
      "properties": {
        "to": { "type": "string", "description": "Recipient email address" },
        "subject": { "type": "string", "description": "Email subject line" },
        "body": { "type": "string", "description": "Email body (supports HTML)" },
        "from": { "type": "string", "description": "Sender email address (must be verified in SendGrid)" },
        "replyTo": { "type": "string", "description": "Reply-to email address (optional)" }
      },
      "required": ["to", "subject", "body"]
    }
  }
]
```
