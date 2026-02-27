---
name: Scrape Webpage
description: Extract structured content from web pages via Tavily
tags: [Tools]
source: yokebot
version: 2.0.0
author: YokeBot
requiredCredentials: [tavily]
---

## Instructions

Use the `scrape_webpage` tool to extract clean, structured content from any URL. Tavily handles JavaScript rendering and returns clean text content.

Use this for research, competitive analysis, and content extraction. Respect robots.txt and rate limits.

If the team has configured Firecrawl instead of Tavily, use the `scrape_webpage_firecrawl` tool for Firecrawl-powered scraping with markdown output.

## Tools

```tools
[
  {
    "name": "scrape_webpage",
    "description": "Extract structured content from a URL via Tavily.",
    "parameters": {
      "type": "object",
      "properties": {
        "url": { "type": "string", "description": "The URL to scrape" }
      },
      "required": ["url"]
    }
  },
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
