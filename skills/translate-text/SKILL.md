---
name: Translate Text
description: Translate text between languages while preserving tone and meaning
tags: [Writing]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `translate_text` tool to translate content between languages. The translation preserves the original tone, formatting, and context while producing natural-sounding output in the target language.

For specialized content (legal, medical, technical), specify the domain for more accurate terminology.

## Tools

```tools
[
  {
    "name": "translate_text",
    "description": "Translate text to a target language while preserving tone and meaning.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The text to translate" },
        "targetLanguage": { "type": "string", "description": "Target language (e.g., 'Spanish', 'French', 'Japanese')" },
        "sourceLanguage": { "type": "string", "description": "Source language if known (auto-detected if omitted)" },
        "domain": { "type": "string", "description": "Content domain for terminology: 'general', 'legal', 'medical', 'technical' (default: general)" }
      },
      "required": ["text", "targetLanguage"]
    }
  }
]
```
