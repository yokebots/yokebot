---
name: Respond to Review
description: Draft and post professional responses to customer reviews
tags: [Channels]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google-places]
---

## Instructions

Use the `respond_to_review` tool to draft professional responses to customer reviews. It generates empathetic, brand-appropriate responses that address specific feedback points.

Always maintain a professional, empathetic tone. Acknowledge concerns, offer solutions, and thank positive reviewers.

## Tools

```tools
[
  {
    "name": "respond_to_review",
    "description": "Draft a professional response to a customer review.",
    "parameters": {
      "type": "object",
      "properties": {
        "review": { "type": "string", "description": "The customer review text to respond to" },
        "rating": { "type": "number", "description": "The review rating (1-5)" },
        "businessName": { "type": "string", "description": "Your business name" },
        "tone": { "type": "string", "description": "Response tone: 'empathetic', 'professional', 'friendly', 'apologetic' (default: professional)" },
        "context": { "type": "string", "description": "Any additional context about the situation (optional)" }
      },
      "required": ["review", "rating", "businessName"]
    }
  }
]
```
