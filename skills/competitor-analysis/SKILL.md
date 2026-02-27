---
name: Competitor Analysis
description: Analyze competitor positioning, strengths, and market strategy
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `competitor_analysis` tool to analyze competitive data. Provide information about competitors and it generates a structured analysis covering positioning, strengths, weaknesses, opportunities, and threats.

Be objective and evidence-based. Focus on actionable insights rather than speculation.

## Tools

```tools
[
  {
    "name": "competitor_analysis",
    "description": "Analyze competitor data and generate a competitive intelligence report.",
    "parameters": {
      "type": "object",
      "properties": {
        "competitors": { "type": "string", "description": "Competitor information, data, or observations to analyze" },
        "yourCompany": { "type": "string", "description": "Brief description of your company for comparison" },
        "focusArea": { "type": "string", "description": "Focus: 'pricing', 'features', 'positioning', 'market-share', 'swot', 'full' (default: full)" }
      },
      "required": ["competitors"]
    }
  }
]
```
