---
name: Create Onboarding Checklist
description: Build employee or customer onboarding workflows
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `create_onboarding_checklist` tool to generate structured onboarding checklists for new employees or customers. Provide the role or product details, and it creates a day-by-day or phase-by-phase checklist with tasks, resources, and milestones.

Break onboarding into manageable phases. Include both mandatory tasks and helpful resources.

## Tools

```tools
[
  {
    "name": "create_onboarding_checklist",
    "description": "Create a structured onboarding checklist for a role or product.",
    "parameters": {
      "type": "object",
      "properties": {
        "role": { "type": "string", "description": "The role, product, or context for onboarding" },
        "type": { "type": "string", "description": "Onboarding type: 'employee', 'customer', 'partner' (default: employee)" },
        "duration": { "type": "string", "description": "Onboarding period: '1-week', '30-days', '90-days' (default: 30-days)" },
        "department": { "type": "string", "description": "Department for employee onboarding (optional)" }
      },
      "required": ["role"]
    }
  }
]
```
