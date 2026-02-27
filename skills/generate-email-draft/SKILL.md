---
name: Generate Email Draft
description: Draft professional emails from context and intent
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_email_draft` tool to compose professional emails. Provide the context, recipient, and purpose, and the tool generates a complete email with subject line and body.

Keep emails concise and action-oriented. Match the tone to the relationship and context.

## Tools

```tools
[
  {
    "name": "generate_email_draft",
    "description": "Draft a professional email with subject line and body.",
    "parameters": {
      "type": "object",
      "properties": {
        "context": { "type": "string", "description": "What the email is about and any relevant background" },
        "recipient": { "type": "string", "description": "Who the email is to (name, role, or relationship)" },
        "purpose": { "type": "string", "description": "The goal: 'introduce', 'follow-up', 'request', 'update', 'thank', 'apologize'" },
        "tone": { "type": "string", "description": "Tone: 'formal', 'friendly', 'urgent', 'casual' (default: professional)" }
      },
      "required": ["context", "purpose"]
    }
  }
]
```
