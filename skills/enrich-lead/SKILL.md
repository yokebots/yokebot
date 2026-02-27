---
name: Enrich Lead
description: Enrich leads with company data, revenue, tech stack, and socials
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [apollo]
---

## Instructions

Use the `enrich_lead` tool to enrich a lead with detailed company and person data from Apollo. Provide a domain or email and get back company size, revenue, tech stack, social profiles, and more.

Use enrichment data to personalize outreach and qualify leads. Cache results to avoid redundant API calls.

## Tools

```tools
[
  {
    "name": "enrich_lead",
    "description": "Enrich a lead with company and contact data via Apollo.",
    "parameters": {
      "type": "object",
      "properties": {
        "domain": { "type": "string", "description": "Company domain to enrich (e.g., 'acme.com')" },
        "email": { "type": "string", "description": "Email address to enrich (alternative to domain)" },
        "firstName": { "type": "string", "description": "Person's first name for more accurate matching (optional)" },
        "lastName": { "type": "string", "description": "Person's last name for more accurate matching (optional)" }
      },
      "required": []
    }
  }
]
```
