---
name: Brainstorm
description: Generate ideas, alternatives, and creative approaches from a prompt
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `brainstorm` tool to generate creative ideas, alternatives, and approaches for any challenge. It produces diverse options organized by category with brief rationale for each.

Think divergently. Prioritize quantity and variety of ideas over perfection.

## Tools

```tools
[
  {
    "name": "brainstorm",
    "description": "Generate creative ideas and approaches for a given challenge.",
    "parameters": {
      "type": "object",
      "properties": {
        "prompt": { "type": "string", "description": "The challenge, question, or topic to brainstorm on" },
        "constraints": { "type": "string", "description": "Any constraints or requirements to consider" },
        "count": { "type": "number", "description": "Number of ideas to generate (default: 10)" },
        "style": { "type": "string", "description": "Brainstorm style: 'diverse', 'practical', 'innovative', 'budget-friendly' (default: diverse)" }
      },
      "required": ["prompt"]
    }
  }
]
```
