---
name: Create Invoice PDF
description: Generate formatted invoices from billing data
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `create_invoice_pdf` tool to generate professional invoice documents from billing details. Provide line items, client info, and terms, and it creates a structured invoice with totals, tax calculations, and payment terms.

Calculate totals accurately. Include all required invoice fields (number, date, due date, terms).

## Tools

```tools
[
  {
    "name": "create_invoice_pdf",
    "description": "Generate a formatted invoice from billing data.",
    "parameters": {
      "type": "object",
      "properties": {
        "clientName": { "type": "string", "description": "Client or company name" },
        "items": { "type": "string", "description": "Line items as JSON array: [{description, quantity, unitPrice}]" },
        "invoiceNumber": { "type": "string", "description": "Invoice number (auto-generated if omitted)" },
        "dueDate": { "type": "string", "description": "Payment due date (default: 30 days from today)" },
        "taxRate": { "type": "number", "description": "Tax rate as percentage (default: 0)" },
        "notes": { "type": "string", "description": "Additional notes or payment instructions (optional)" }
      },
      "required": ["clientName", "items"]
    }
  }
]
```
