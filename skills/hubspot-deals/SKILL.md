---
name: HubSpot Deals
description: Manage deals and pipeline stages in HubSpot CRM
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [hubspot]
---

## Instructions

Use the `hubspot_list_deals` tool to view, create, and manage deals in HubSpot. Track pipeline stages, deal amounts, and close dates across your sales process.

Keep deal stages updated. Include amount and close date when creating deals.

## Tools

```tools
[
  {
    "name": "hubspot_list_deals",
    "description": "List, create, or update deals in HubSpot CRM.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'list', 'create', 'update'" },
        "pipeline": { "type": "string", "description": "Pipeline ID to filter by (for list action)" },
        "stage": { "type": "string", "description": "Deal stage (for create/update)" },
        "dealName": { "type": "string", "description": "Deal name (for create)" },
        "amount": { "type": "number", "description": "Deal amount (for create/update)" },
        "closeDate": { "type": "string", "description": "Expected close date YYYY-MM-DD (for create/update)" },
        "dealId": { "type": "string", "description": "Deal ID (required for update)" }
      },
      "required": ["action"]
    }
  }
]
```
