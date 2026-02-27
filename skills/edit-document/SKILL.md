---
name: Edit Document
description: Rewrite and improve documents for clarity, grammar, and style
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `edit_document` tool to improve existing text. It can fix grammar, enhance clarity, adjust tone, tighten prose, or rewrite sections entirely based on the requested edit type.

Preserve the original meaning and intent. Return the edited text with a brief note on what was changed.

## Tools

```tools
[
  {
    "name": "edit_document",
    "description": "Edit and improve a document for clarity, grammar, tone, or style.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The text to edit" },
        "editType": { "type": "string", "description": "Type of edit: 'grammar', 'clarity', 'tone', 'shorten', 'expand', 'rewrite' (default: clarity)" },
        "targetTone": { "type": "string", "description": "Target tone when editType is 'tone' (e.g., 'formal', 'friendly', 'technical')" }
      },
      "required": ["text"]
    }
  }
]
```
