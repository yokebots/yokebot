---
name: Web Search
description: Search the web for up-to-date information using Brave Search API
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `web_search` tool when you need current information that may not be in your training data, such as recent events, product details, company info, or technical documentation.

Keep queries concise and specific. Summarize the results for the user rather than dumping raw data.

Requires the `BRAVE_API_KEY` environment variable to be configured on the engine.

## Tools

```tools
[
  {
    "name": "web_search",
    "description": "Search the web for current information. Returns titles, URLs, and snippets.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "The search query" },
        "count": { "type": "number", "description": "Number of results to return (default 5, max 20)" }
      },
      "required": ["query"]
    }
  }
]
```
