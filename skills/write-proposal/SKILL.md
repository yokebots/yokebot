---
name: Write Proposal
description: Draft business and sales proposals from requirements
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `write_proposal` tool to create professional business or sales proposals. Provide the client context and offering details, and it generates a complete proposal with problem statement, solution, timeline, and pricing framework.

Focus on the client's pain points and how the solution addresses them specifically.

## Tools

```tools
[
  {
    "name": "write_proposal",
    "description": "Draft a business or sales proposal.",
    "parameters": {
      "type": "object",
      "properties": {
        "client": { "type": "string", "description": "Client name and context" },
        "offering": { "type": "string", "description": "What you're proposing (product, service, solution)" },
        "problem": { "type": "string", "description": "The problem or need being addressed" },
        "budget": { "type": "string", "description": "Budget range or pricing details (optional)" }
      },
      "required": ["client", "offering"]
    }
  }
]
```
