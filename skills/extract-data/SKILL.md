---
name: Extract Data
description: Pull structured data from unstructured text documents
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `extract_data` tool to pull structured information from unstructured text. It can extract names, dates, amounts, addresses, entities, or custom fields and return them in a structured JSON format.

Specify the fields you need extracted. The tool handles messy, inconsistent formatting.

## Tools

```tools
[
  {
    "name": "extract_data",
    "description": "Extract structured data fields from unstructured text.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The unstructured text to extract from" },
        "fields": { "type": "string", "description": "Comma-separated list of fields to extract (e.g., 'name, email, company, date, amount')" },
        "outputFormat": { "type": "string", "description": "Output format: 'json', 'csv', 'table' (default: json)" }
      },
      "required": ["text", "fields"]
    }
  }
]
```
