---
name: Generate Sound FX
description: Premium AI sound effects and foley via Mirelo SFX — 70%+ win rate in blind tests
tags: [Media]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_sound_fx` tool to create premium sound effects, ambient audio, and foley from text descriptions. Powered by Mirelo SFX, which wins 70%+ of blind listening tests against competitors.

Perfect for video content, podcasts, presentations, and social media. Describe the sound you want clearly: "rain on a tin roof", "crowd cheering in a stadium", "sci-fi laser blast", etc.

## Tools

```tools
[
  {
    "name": "generate_sound_fx",
    "description": "Generate sound effects and ambient audio from a text description.",
    "parameters": {
      "type": "object",
      "properties": {
        "prompt": { "type": "string", "description": "Description of the sound to generate (e.g., 'thunder rolling across a valley')" },
        "durationSeconds": { "type": "number", "description": "Duration in seconds (default: 8, max: 16)" }
      },
      "required": ["prompt"]
    }
  }
]
```
