---
name: Brand Check
description: Review content against brand guidelines for consistency
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `brand_check` tool to review content against brand guidelines. It checks tone of voice, terminology, messaging consistency, and visual style references to ensure content aligns with the brand.

Flag specific violations with suggestions for fixing them. Rate overall brand alignment.

## Tools

```tools
[
  {
    "name": "brand_check",
    "description": "Review content for brand guideline consistency.",
    "parameters": {
      "type": "object",
      "properties": {
        "content": { "type": "string", "description": "The content to review" },
        "guidelines": { "type": "string", "description": "Brand guidelines, tone of voice rules, or style guide to check against" },
        "contentType": { "type": "string", "description": "Type of content: 'email', 'social', 'website', 'ad', 'document' (default: document)" }
      },
      "required": ["content", "guidelines"]
    }
  }
]
```
