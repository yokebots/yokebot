---
name: SEO Audit
description: Analyze page content for SEO issues and optimization opportunities
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `seo_audit` tool to analyze webpage content for SEO optimization opportunities. It evaluates title tags, meta descriptions, heading structure, keyword usage, content quality, and technical SEO factors.

Prioritize issues by impact. Provide specific, actionable recommendations for each finding.

## Tools

```tools
[
  {
    "name": "seo_audit",
    "description": "Analyze page content for SEO issues and provide recommendations.",
    "parameters": {
      "type": "object",
      "properties": {
        "content": { "type": "string", "description": "Page HTML or text content to audit" },
        "targetKeyword": { "type": "string", "description": "Primary target keyword for the page" },
        "url": { "type": "string", "description": "Page URL for reference (optional)" }
      },
      "required": ["content"]
    }
  }
]
```
