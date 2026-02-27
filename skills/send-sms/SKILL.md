---
name: Send SMS
description: Send SMS and MMS messages via Twilio
tags: [Channels]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [twilio]
---

## Instructions

Use the `send_sms` tool to send text messages via Twilio. Provide the recipient phone number and message content. Supports SMS and MMS with media attachments.

Always confirm the phone number and message before sending. Keep SMS under 160 characters when possible.

## Tools

```tools
[
  {
    "name": "send_sms",
    "description": "Send an SMS or MMS message via Twilio.",
    "parameters": {
      "type": "object",
      "properties": {
        "to": { "type": "string", "description": "Recipient phone number in E.164 format (e.g., +15551234567)" },
        "body": { "type": "string", "description": "Message text" },
        "from": { "type": "string", "description": "Sender phone number (must be a Twilio number)" },
        "mediaUrl": { "type": "string", "description": "URL of media to attach for MMS (optional)" }
      },
      "required": ["to", "body"]
    }
  }
]
```
