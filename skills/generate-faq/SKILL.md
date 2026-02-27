---
name: Generate FAQ
description: Create FAQ content from product or service documentation
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_faq` tool to create frequently asked questions and answers from product or service documentation. It identifies the most likely questions customers would ask and provides clear, concise answers.

Organize FAQs by category. Write answers that are helpful to someone unfamiliar with the product.

## Tools

```tools
[
  {
    "name": "generate_faq",
    "description": "Generate FAQ content from product or service documentation.",
    "parameters": {
      "type": "object",
      "properties": {
        "documentation": { "type": "string", "description": "Product or service documentation to base FAQs on" },
        "audience": { "type": "string", "description": "Target audience: 'customers', 'employees', 'partners', 'developers' (default: customers)" },
        "count": { "type": "number", "description": "Number of FAQ items to generate (default: 15)" }
      },
      "required": ["documentation"]
    }
  }
]
```
