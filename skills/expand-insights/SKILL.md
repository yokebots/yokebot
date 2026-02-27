---
name: Expand Insights
description: Expand brief notes into detailed analysis with actionable insights
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `expand_insights` tool to take a brief idea, observation, or data point and expand it into a detailed analysis with context, implications, and actionable recommendations.

Think critically about the input. Provide multiple angles and practical next steps.

## Tools

```tools
[
  {
    "name": "expand_insights",
    "description": "Expand a brief note or idea into detailed analysis with actionable insights.",
    "parameters": {
      "type": "object",
      "properties": {
        "input": { "type": "string", "description": "The brief idea, note, or observation to expand" },
        "context": { "type": "string", "description": "Additional context about the business or situation" },
        "depth": { "type": "string", "description": "Analysis depth: 'brief', 'standard', 'deep' (default: standard)" }
      },
      "required": ["input"]
    }
  }
]
```
