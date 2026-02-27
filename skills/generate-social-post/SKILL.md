---
name: Generate Social Post
description: Create platform-specific social media content
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_social_post` tool to create social media posts optimized for specific platforms. Each post respects platform character limits and conventions (hashtags, mentions, formatting).

Write engaging, shareable content. Include relevant hashtags and calls-to-action where appropriate.

## Tools

```tools
[
  {
    "name": "generate_social_post",
    "description": "Create a social media post optimized for a specific platform.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": { "type": "string", "description": "What the post is about" },
        "platform": { "type": "string", "description": "Target platform: 'twitter', 'linkedin', 'instagram', 'facebook' (default: linkedin)" },
        "tone": { "type": "string", "description": "Tone: 'professional', 'casual', 'witty', 'inspirational' (default: professional)" },
        "includeHashtags": { "type": "boolean", "description": "Whether to include hashtags (default: true)" }
      },
      "required": ["topic"]
    }
  }
]
```
