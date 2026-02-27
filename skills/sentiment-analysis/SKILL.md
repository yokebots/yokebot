---
name: Sentiment Analysis
description: Analyze sentiment of text, reviews, feedback, and social mentions
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `sentiment_analysis` tool to determine the sentiment and emotional tone of text. It works on reviews, customer feedback, survey responses, social media posts, and general text.

Return a clear sentiment score with supporting evidence. Identify specific phrases that drive the sentiment.

## Tools

```tools
[
  {
    "name": "sentiment_analysis",
    "description": "Analyze the sentiment and emotional tone of text.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The text to analyze" },
        "granularity": { "type": "string", "description": "Analysis level: 'overall', 'sentence', 'aspect' (default: overall)" },
        "aspects": { "type": "string", "description": "Comma-separated aspects to evaluate when granularity is 'aspect' (e.g., 'price, quality, support')" }
      },
      "required": ["text"]
    }
  }
]
```
