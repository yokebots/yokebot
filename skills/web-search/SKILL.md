---
name: Web Search
description: Search the web for up-to-date information via Tavily
tags: [Tools]
source: yokebot
version: 2.0.0
author: YokeBot
requiredCredentials: [tavily]
---

## Instructions

Use the `web_search` tool when you need current information that may not be in your training data, such as recent events, product details, company info, or technical documentation.

Keep queries concise and specific. Summarize the results for the user rather than dumping raw data.

## Tools

```tools
[
  {
    "name": "web_search",
    "description": "Search the web for current information. Returns titles, URLs, and content snippets.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "The search query" },
        "count": { "type": "number", "description": "Number of results to return (default 5, max 10)" }
      },
      "required": ["query"]
    }
  }
]
```
