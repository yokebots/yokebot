---
name: Search Companies
description: Look up company data — industry, employees, revenue, funding, tech stack, and more
tags: [Data]
source: yokebot
version: 1.0.0
author: YokeBot
credentials:
  - id: apollo
    name: Apollo
    description: API key for company enrichment (apollo.io)
---

## Instructions

Use the `search_companies` tool to look up detailed company information. Search by domain name for precise enrichment, or by company name for broader discovery.

Returns structured data including industry, employee count, revenue, funding, headquarters, technology stack, and social profiles.

Ideal for:
- Sales prospecting and lead enrichment
- Competitive research and market analysis
- Due diligence and partnership evaluation

## Tools

```tools
[
  {
    "name": "search_companies",
    "description": "Look up company information by domain or name. Returns industry, employees, revenue, funding, tech stack, and more.",
    "parameters": {
      "type": "object",
      "properties": {
        "domain": { "type": "string", "description": "Company website domain (e.g., 'stripe.com') for precise enrichment" },
        "name": { "type": "string", "description": "Company name to search for (used when domain is unknown)" },
        "industry": { "type": "string", "description": "Filter by industry (e.g., 'technology', 'healthcare', 'finance')" }
      }
    }
  }
]
```
