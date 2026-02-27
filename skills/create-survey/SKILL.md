---
name: Create Survey
description: Generate survey questions with logic branching from research goals
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `create_survey` tool to design surveys from research objectives. It generates questions with appropriate types (Likert scale, multiple choice, open-ended), logical flow, and skip logic suggestions.

Keep surveys focused and concise. Avoid leading questions and double-barreled items.

## Tools

```tools
[
  {
    "name": "create_survey",
    "description": "Generate a survey with questions and logic branching.",
    "parameters": {
      "type": "object",
      "properties": {
        "objective": { "type": "string", "description": "The research goal or what you want to learn" },
        "audience": { "type": "string", "description": "Who will take the survey" },
        "questionCount": { "type": "number", "description": "Target number of questions (default: 12)" },
        "surveyType": { "type": "string", "description": "Type: 'satisfaction', 'feedback', 'market-research', 'employee', 'custom' (default: custom)" }
      },
      "required": ["objective"]
    }
  }
]
```
