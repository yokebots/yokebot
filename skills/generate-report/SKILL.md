---
name: Generate Report
description: Create formatted business reports from data and observations
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_report` tool to create structured business reports. Provide raw data or observations and the tool generates a professional report with executive summary, findings, analysis, and recommendations.

Use clear headings, tables where appropriate, and lead with the most important findings.

## Tools

```tools
[
  {
    "name": "generate_report",
    "description": "Generate a structured business report from data and observations.",
    "parameters": {
      "type": "object",
      "properties": {
        "data": { "type": "string", "description": "Raw data, observations, or findings to include" },
        "reportType": { "type": "string", "description": "Type: 'weekly', 'monthly', 'quarterly', 'project', 'incident', 'custom' (default: custom)" },
        "audience": { "type": "string", "description": "Target audience: 'executive', 'team', 'client', 'technical' (default: executive)" },
        "title": { "type": "string", "description": "Report title" }
      },
      "required": ["data"]
    }
  }
]
```
