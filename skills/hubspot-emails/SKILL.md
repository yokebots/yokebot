---
name: HubSpot Emails
description: Log and track email activity in HubSpot CRM
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [hubspot]
---

## Instructions

Use the `hubspot_emails` tool to log email interactions and track engagement in HubSpot CRM. Associate emails with contacts and deals to maintain a complete activity timeline.

Log all significant email interactions. Include context about the conversation purpose and outcome.

## Tools

```tools
[
  {
    "name": "hubspot_emails",
    "description": "Log and track email engagement in HubSpot CRM.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'log', 'list', 'track'" },
        "contactId": { "type": "string", "description": "HubSpot contact ID to associate with" },
        "subject": { "type": "string", "description": "Email subject line (for log)" },
        "body": { "type": "string", "description": "Email body content (for log)" },
        "direction": { "type": "string", "description": "Email direction: 'incoming', 'outgoing' (for log, default: outgoing)" },
        "dealId": { "type": "string", "description": "Optional deal ID to associate email with" }
      },
      "required": ["action"]
    }
  }
]
```
