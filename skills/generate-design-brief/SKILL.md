---
name: Generate Design Brief
description: Create structured design briefs from project requirements
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_design_brief` tool to create professional design briefs. Provide the project requirements and goals, and it generates a comprehensive brief covering objectives, audience, deliverables, timeline, brand guidelines, and success criteria.

Be specific about constraints and expectations. Include examples of desired style where possible.

## Tools

```tools
[
  {
    "name": "generate_design_brief",
    "description": "Create a structured design brief from project requirements.",
    "parameters": {
      "type": "object",
      "properties": {
        "project": { "type": "string", "description": "Description of the design project" },
        "objective": { "type": "string", "description": "The goal of the design work" },
        "audience": { "type": "string", "description": "Target audience for the design" },
        "brandGuidelines": { "type": "string", "description": "Existing brand guidelines or style preferences (optional)" },
        "deliverables": { "type": "string", "description": "Expected deliverables (e.g., 'logo, business card, letterhead')" }
      },
      "required": ["project", "objective"]
    }
  }
]
```
