---
name: Generate Ad Copy
description: Write ad copy variations for A/B testing across platforms
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_ad_copy` tool to create advertising copy variations. It generates multiple versions optimized for the target platform with headlines, descriptions, and calls-to-action suitable for A/B testing.

Write compelling, concise copy. Respect platform character limits and best practices.

## Tools

```tools
[
  {
    "name": "generate_ad_copy",
    "description": "Generate ad copy variations for A/B testing.",
    "parameters": {
      "type": "object",
      "properties": {
        "product": { "type": "string", "description": "Product or service to advertise" },
        "audience": { "type": "string", "description": "Target audience description" },
        "platform": { "type": "string", "description": "Ad platform: 'google', 'facebook', 'linkedin', 'instagram' (default: google)" },
        "variations": { "type": "number", "description": "Number of variations to generate (default: 3)" },
        "cta": { "type": "string", "description": "Desired call-to-action (e.g., 'Sign Up', 'Learn More', 'Buy Now')" }
      },
      "required": ["product", "audience"]
    }
  }
]
```
