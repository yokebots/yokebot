---
name: Read Email
description: Read and search inbox messages via Gmail API
tags: [Channels]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google]
---

## Instructions

Use the `read_email` tool to search and read emails from Gmail. You can search by sender, subject, date range, or keywords. Returns message previews with sender, subject, date, and snippet.

Respect privacy — only access emails relevant to the task at hand. Summarize rather than expose full email contents.

## Tools

```tools
[
  {
    "name": "read_email",
    "description": "Search and read emails from Gmail.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Gmail search query (e.g., 'from:boss@company.com subject:quarterly')" },
        "maxResults": { "type": "number", "description": "Maximum emails to return (default: 10, max: 50)" },
        "includeBody": { "type": "boolean", "description": "Whether to include full email body (default: false, returns snippets only)" }
      },
      "required": ["query"]
    }
  }
]
```
