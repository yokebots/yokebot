---
name: Scrape Webpage
description: Extract structured content from web pages via Firecrawl
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [firecrawl]
---

## Instructions

Use the `scrape_webpage` tool to extract clean, structured content from any URL. Firecrawl handles JavaScript rendering, cookie banners, and paywall detection to return clean markdown content.

Use this for research, competitive analysis, and content extraction. Respect robots.txt and rate limits.

## Tools

```tools
[
  {
    "name": "scrape_webpage",
    "description": "Extract structured content from a URL via Firecrawl.",
    "parameters": {
      "type": "object",
      "properties": {
        "url": { "type": "string", "description": "The URL to scrape" },
        "format": { "type": "string", "description": "Output format: 'markdown', 'text', 'html' (default: markdown)" },
        "includeLinks": { "type": "boolean", "description": "Whether to preserve hyperlinks (default: true)" }
      },
      "required": ["url"]
    }
  }
]
```
