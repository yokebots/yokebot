---
name: Scrape Webpage (Firecrawl)
description: Extract structured content from web pages via Firecrawl with markdown output
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [firecrawl]
---

## Instructions

Use the `scrape_webpage_firecrawl` tool to extract clean, structured content from any URL using Firecrawl. Returns well-formatted markdown with preserved links and structure.

This skill requires a Firecrawl API key. Configure it in Settings → Integrations.

Use this for research, competitive analysis, and content extraction. Respect robots.txt and rate limits.

## Tools

```tools
[
  {
    "name": "scrape_webpage_firecrawl",
    "description": "Extract structured content from a URL via Firecrawl (requires Firecrawl API key).",
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
