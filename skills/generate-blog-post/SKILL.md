---
name: Generate Blog Post
description: Write SEO-optimized blog posts from topics or outlines
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_blog_post` tool to create well-structured blog articles. Provide a topic or outline and the tool returns a complete post with headings, introduction, body sections, and conclusion.

Write in a clear, engaging voice. Include relevant subheadings for SEO and readability.

## Tools

```tools
[
  {
    "name": "generate_blog_post",
    "description": "Generate a structured blog post from a topic or outline.",
    "parameters": {
      "type": "object",
      "properties": {
        "topic": { "type": "string", "description": "The blog post topic or title" },
        "outline": { "type": "string", "description": "Optional outline or key points to cover" },
        "tone": { "type": "string", "description": "Writing tone: 'professional', 'casual', 'technical', 'conversational' (default: professional)" },
        "wordCount": { "type": "number", "description": "Target word count (default: 800)" }
      },
      "required": ["topic"]
    }
  }
]
```
