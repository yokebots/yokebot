---
name: Proofread
description: Check text for grammar, spelling, style, and consistency errors
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `proofread` tool to review text for errors. It checks grammar, spelling, punctuation, style consistency, and readability, returning a corrected version with a list of changes made.

Be thorough but preserve the author's voice. Flag issues by category so the user can review selectively.

## Tools

```tools
[
  {
    "name": "proofread",
    "description": "Proofread text for grammar, spelling, style, and consistency errors.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The text to proofread" },
        "styleGuide": { "type": "string", "description": "Style guide to follow: 'ap', 'chicago', 'apa', 'general' (default: general)" },
        "focusAreas": { "type": "string", "description": "Comma-separated focus areas: 'grammar', 'spelling', 'style', 'consistency', 'readability' (default: all)" }
      },
      "required": ["text"]
    }
  }
]
```
