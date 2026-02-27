---
name: Analyze CSV
description: Parse CSV data and generate statistical insights and summaries
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `analyze_csv` tool to analyze tabular data in CSV format. It identifies patterns, calculates statistics, finds outliers, and generates a structured report with key insights.

Focus on actionable insights rather than raw numbers. Highlight trends, anomalies, and correlations.

## Tools

```tools
[
  {
    "name": "analyze_csv",
    "description": "Analyze CSV data and generate statistical insights.",
    "parameters": {
      "type": "object",
      "properties": {
        "csv": { "type": "string", "description": "CSV data as a string (with headers)" },
        "question": { "type": "string", "description": "Specific question to answer about the data (optional)" },
        "analysisType": { "type": "string", "description": "Type of analysis: 'summary', 'trends', 'outliers', 'correlations', 'full' (default: full)" }
      },
      "required": ["csv"]
    }
  }
]
```
