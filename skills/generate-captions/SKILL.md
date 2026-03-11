---
name: Generate Captions
description: Generate SRT or VTT subtitle files from video or audio content
tags: [Media]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_captions` tool to create properly formatted subtitle files from video or audio. Supports SRT and VTT output formats with accurate timestamps.

Ideal for:
- Adding subtitles to videos for accessibility
- Creating closed captions for social media content
- Generating transcripts with precise timing
- Multi-language subtitle creation

## Tools

```tools
[
  {
    "name": "generate_captions",
    "description": "Generate timed subtitle/caption files (SRT or VTT) from video or audio content.",
    "parameters": {
      "type": "object",
      "properties": {
        "mediaUrl": { "type": "string", "description": "URL of the video or audio file" },
        "format": { "type": "string", "description": "Output format: 'srt' or 'vtt' (default: srt)" },
        "language": { "type": "string", "description": "Language code (e.g., 'en', 'es', 'fr') or 'auto' for auto-detection (default: auto)" }
      },
      "required": ["mediaUrl"]
    }
  }
]
```
