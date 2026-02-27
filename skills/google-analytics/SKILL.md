---
name: Google Analytics
description: Pull traffic and conversion reports from Google Analytics 4
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google-analytics]
---

## Instructions

Use the `google_analytics_report` tool to pull analytics data from GA4. Get traffic reports, conversion metrics, user demographics, and page performance data.

Present data in context with trends and comparisons. Highlight significant changes and anomalies.

## Tools

```tools
[
  {
    "name": "google_analytics_report",
    "description": "Pull analytics reports from Google Analytics 4.",
    "parameters": {
      "type": "object",
      "properties": {
        "propertyId": { "type": "string", "description": "GA4 property ID" },
        "reportType": { "type": "string", "description": "Report type: 'traffic', 'conversions', 'pages', 'demographics', 'sources', 'custom'" },
        "dateRange": { "type": "string", "description": "Date range: 'today', '7days', '30days', '90days', or 'YYYY-MM-DD:YYYY-MM-DD' (default: 30days)" },
        "dimensions": { "type": "string", "description": "Comma-separated dimensions for custom report (e.g., 'country, deviceCategory')" },
        "metrics": { "type": "string", "description": "Comma-separated metrics for custom report (e.g., 'sessions, conversions')" }
      },
      "required": ["propertyId", "reportType"]
    }
  }
]
```
