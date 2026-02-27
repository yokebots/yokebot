---
name: Stripe Customers
description: List customers, invoices, and payment status via Stripe
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [stripe]
---

## Instructions

Use the `stripe_customers` tool to query customer, invoice, and payment data from Stripe. Search customers, check payment statuses, and list recent invoices.

Handle financial data with care. Never expose full payment card details.

## Tools

```tools
[
  {
    "name": "stripe_customers",
    "description": "Query customer, invoice, and payment data from Stripe.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'list-customers', 'search-customer', 'list-invoices', 'list-payments'" },
        "query": { "type": "string", "description": "Search query (email, name, or customer ID)" },
        "customerId": { "type": "string", "description": "Stripe customer ID (for customer-specific queries)" },
        "status": { "type": "string", "description": "Filter invoices by status: 'paid', 'open', 'draft', 'uncollectible' (optional)" },
        "limit": { "type": "number", "description": "Number of results to return (default: 10)" }
      },
      "required": ["action"]
    }
  }
]
```
