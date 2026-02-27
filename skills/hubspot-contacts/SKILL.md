---
name: HubSpot Contacts
description: Search, create, and update CRM contacts in HubSpot
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [hubspot]
---

## Instructions

Use the `hubspot_search_contacts` tool to find, create, or update contacts in HubSpot CRM. Search by name, email, company, or any contact property. Create new contacts from lead data or update existing records.

Always search before creating to avoid duplicates. Include all available data when creating or updating.

## Tools

```tools
[
  {
    "name": "hubspot_search_contacts",
    "description": "Search, create, or update contacts in HubSpot CRM.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'search', 'create', 'update'" },
        "query": { "type": "string", "description": "Search query (for search action)" },
        "email": { "type": "string", "description": "Contact email (for create/update)" },
        "firstName": { "type": "string", "description": "First name (for create/update)" },
        "lastName": { "type": "string", "description": "Last name (for create/update)" },
        "company": { "type": "string", "description": "Company name (for create/update)" },
        "phone": { "type": "string", "description": "Phone number (for create/update)" },
        "contactId": { "type": "string", "description": "Contact ID (required for update)" }
      },
      "required": ["action"]
    }
  }
]
```
