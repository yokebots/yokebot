---
name: Write SOP
description: Create standard operating procedures from process descriptions
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `write_sop` tool to create structured standard operating procedures. Provide a description of the process and the tool generates a formal SOP with purpose, scope, steps, roles, and quality checks.

Write clear, numbered steps that anyone can follow. Include decision points and exception handling where relevant.

## Tools

```tools
[
  {
    "name": "write_sop",
    "description": "Create a standard operating procedure document from a process description.",
    "parameters": {
      "type": "object",
      "properties": {
        "process": { "type": "string", "description": "Description of the process to document" },
        "department": { "type": "string", "description": "Department or team this SOP is for" },
        "audience": { "type": "string", "description": "Who will follow this SOP (e.g., 'new hires', 'senior engineers')" }
      },
      "required": ["process"]
    }
  }
]
```
