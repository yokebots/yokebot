---
name: Compare Documents
description: Diff two documents and highlight differences, gaps, and changes
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `compare_documents` tool to analyze differences between two versions of a document. It identifies additions, deletions, modifications, and structural changes, presenting them in a clear summary.

Highlight the most significant changes first. Note any potential issues introduced by the changes.

## Tools

```tools
[
  {
    "name": "compare_documents",
    "description": "Compare two documents and highlight differences and changes.",
    "parameters": {
      "type": "object",
      "properties": {
        "documentA": { "type": "string", "description": "First document (original)" },
        "documentB": { "type": "string", "description": "Second document (revised)" },
        "focusOn": { "type": "string", "description": "What to focus on: 'all', 'content', 'structure', 'tone', 'legal' (default: all)" }
      },
      "required": ["documentA", "documentB"]
    }
  }
]
```
