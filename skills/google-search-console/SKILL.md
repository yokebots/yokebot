---
name: Google Search Console
description: Check keyword rankings, indexing status, and search performance
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google-analytics]
---

## Instructions

Use the `google_search_console` tool to access Google Search Console data. Check keyword rankings, click-through rates, indexing status, and search performance metrics.

Focus on trending keywords and opportunities. Compare time periods to identify changes.

## Tools

```tools
[
  {
    "name": "google_search_console",
    "description": "Query Google Search Console for search performance data.",
    "parameters": {
      "type": "object",
      "properties": {
        "siteUrl": { "type": "string", "description": "Site URL (e.g., 'https://example.com')" },
        "reportType": { "type": "string", "description": "Report type: 'queries', 'pages', 'countries', 'devices', 'indexing'" },
        "dateRange": { "type": "string", "description": "Date range: '7days', '28days', '3months', or 'YYYY-MM-DD:YYYY-MM-DD' (default: 28days)" },
        "query": { "type": "string", "description": "Filter by specific keyword or query (optional)" },
        "page": { "type": "string", "description": "Filter by specific page URL (optional)" }
      },
      "required": ["siteUrl", "reportType"]
    }
  }
]
```
