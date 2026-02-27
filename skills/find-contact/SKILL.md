---
name: Find Contact
description: Find email addresses and contact info from name and company
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [hunter]
---

## Instructions

Use the `find_contact` tool to find professional email addresses using Hunter.io. Provide a person's name and company domain to find their email and verify its deliverability.

Only use for legitimate business outreach. Respect opt-outs and unsubscribe requests.

## Tools

```tools
[
  {
    "name": "find_contact",
    "description": "Find email addresses and contact info via Hunter.io.",
    "parameters": {
      "type": "object",
      "properties": {
        "domain": { "type": "string", "description": "Company domain (e.g., 'acme.com')" },
        "firstName": { "type": "string", "description": "Person's first name" },
        "lastName": { "type": "string", "description": "Person's last name" },
        "type": { "type": "string", "description": "Search type: 'find' (specific person) or 'search' (all emails at domain) (default: find)" }
      },
      "required": ["domain"]
    }
  }
]
```
