---
name: Scrape Webpage
description: Extract structured content from web pages via Tavily
tags: [Tools]
source: yokebot
version: 2.1.0
author: YokeBot
requiredCredentials: [tavily]
---

## Instructions

Use the `scrape_webpage` tool to extract clean, structured content from any URL. Tavily handles JavaScript rendering and returns clean text content.

Use this for research, competitive analysis, and content extraction. Respect robots.txt and rate limits.

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
  }
]
```
