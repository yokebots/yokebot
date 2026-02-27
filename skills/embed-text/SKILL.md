---
name: Embed Text
description: MTEB #1 embeddings via Qwen3-Embedding-8B for semantic search and knowledge base
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `embed_text` tool to generate vector embeddings from text using Qwen3-Embedding-8B, the current #1 model on the MTEB multilingual leaderboard. These embeddings power the knowledge base semantic search, document similarity, clustering, and RAG.

Supports 100+ languages. Provide one or more text passages to embed.

## Tools

```tools
[
  {
    "name": "embed_text",
    "description": "Generate vector embeddings from text using BGE-M3.",
    "parameters": {
      "type": "object",
      "properties": {
        "texts": {
          "type": "array",
          "items": { "type": "string" },
          "description": "One or more text passages to embed (max 32 per request)"
        }
      },
      "required": ["texts"]
    }
  }
]
```
