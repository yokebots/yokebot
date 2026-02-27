---
name: Monitor News
description: Track news mentions and industry trends via NewsAPI
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [newsapi]
---

## Instructions

Use the `monitor_news` tool to search and monitor news articles. Track mentions of companies, products, competitors, or industry keywords across thousands of news sources.

Summarize findings and highlight the most relevant articles. Filter by recency for time-sensitive monitoring.

## Tools

```tools
[
  {
    "name": "monitor_news",
    "description": "Search news articles and track mentions via NewsAPI.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Search keywords or phrase" },
        "sources": { "type": "string", "description": "Comma-separated source IDs to filter by (optional)" },
        "from": { "type": "string", "description": "Start date in YYYY-MM-DD format (optional)" },
        "sortBy": { "type": "string", "description": "Sort order: 'relevancy', 'popularity', 'publishedAt' (default: publishedAt)" },
        "pageSize": { "type": "number", "description": "Number of results (default: 10, max: 100)" }
      },
      "required": ["query"]
    }
  }
]
```
