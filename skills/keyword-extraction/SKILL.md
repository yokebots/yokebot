---
name: Keyword Extraction
description: Extract keywords and topics for SEO and content categorization
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `keyword_extraction` tool to identify the most important keywords, phrases, and topics from text. Useful for SEO optimization, content tagging, and topic categorization.

Rank keywords by relevance and frequency. Group related terms together.

## Tools

```tools
[
  {
    "name": "keyword_extraction",
    "description": "Extract keywords and key phrases from text.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The text to extract keywords from" },
        "maxKeywords": { "type": "number", "description": "Maximum number of keywords to return (default: 20)" },
        "type": { "type": "string", "description": "Extraction type: 'seo', 'topics', 'entities', 'all' (default: all)" }
      },
      "required": ["text"]
    }
  }
]
```
