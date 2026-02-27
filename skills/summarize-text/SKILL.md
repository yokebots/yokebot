---
name: Summarize Text
description: Condense documents into structured summaries with key points
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `summarize_text` tool to create concise summaries of long documents, articles, reports, or meeting transcripts. The summary preserves key points, decisions, and action items in a structured format.

Aim for clarity and brevity. Use bullet points for key takeaways and keep the summary under 30% of the original length.

## Tools

```tools
[
  {
    "name": "summarize_text",
    "description": "Summarize a document or text into a structured summary with key points.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The text to summarize" },
        "style": { "type": "string", "description": "Summary style: 'bullets', 'paragraph', 'executive' (default: bullets)" },
        "maxLength": { "type": "number", "description": "Approximate max word count for the summary (default: 200)" }
      },
      "required": ["text"]
    }
  }
]
```
