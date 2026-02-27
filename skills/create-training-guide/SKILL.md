---
name: Create Training Guide
description: Build step-by-step training documentation from procedures
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `create_training_guide` tool to generate step-by-step training documentation. Provide the procedure or topic, and it creates a comprehensive guide with learning objectives, instructions, examples, and practice exercises.

Write for the intended skill level. Include screenshot placeholders and tips where helpful.

## Tools

```tools
[
  {
    "name": "create_training_guide",
    "description": "Create step-by-step training documentation from a procedure.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": { "type": "string", "description": "The procedure or topic to create training for" },
        "audience": { "type": "string", "description": "Target learner: 'new-hire', 'experienced', 'manager', 'technical' (default: new-hire)" },
        "format": { "type": "string", "description": "Guide format: 'step-by-step', 'reference', 'workshop' (default: step-by-step)" }
      },
      "required": ["topic"]
    }
  }
]
```
