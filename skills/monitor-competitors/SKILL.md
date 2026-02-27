---
name: Monitor Competitors
description: Track competitor websites, pricing changes, and product launches
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `monitor_competitors` tool to track and analyze competitor activity. Provide competitor URLs, names, or domains, and the tool synthesizes available information into a competitive intelligence report covering pricing, features, messaging, and recent changes.

Focus on actionable insights. Compare findings against your own positioning to identify opportunities and threats.

## Tools

```tools
[
  {
    "name": "monitor_competitors",
    "description": "Track competitor websites, pricing, and product launches.",
    "parameters": {
      "type": "object",
      "properties": {
        "competitors": { "type": "string", "description": "Comma-separated competitor names or domains to monitor" },
        "focusAreas": { "type": "string", "description": "Areas to track: 'pricing', 'features', 'messaging', 'hiring', 'news', 'all' (default: all)" },
        "yourProduct": { "type": "string", "description": "Brief description of your product for comparison context (optional)" }
      },
      "required": ["competitors"]
    }
  }
]
```
