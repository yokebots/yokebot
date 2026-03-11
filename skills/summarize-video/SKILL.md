---
name: Summarize Video
description: Transcribe and summarize video content — extracts key points, topics, and action items
tags: [Media]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `summarize_video` tool to transcribe a video's audio track and generate a structured summary. The tool extracts speech via Voxtral, then returns the transcript for you to summarize.

Ideal for:
- Meeting recordings, webinars, and lectures
- YouTube videos and podcast episodes
- Training videos and tutorials
- Any video with spoken content

After receiving the transcript, provide a clear summary with key points, topics discussed, and any action items mentioned.

## Tools

```tools
[
  {
    "name": "summarize_video",
    "description": "Transcribe and summarize a video's audio content. Returns a timestamped transcript for summarization.",
    "parameters": {
      "type": "object",
      "properties": {
        "videoUrl": { "type": "string", "description": "URL of the video file to summarize" },
        "language": { "type": "string", "description": "Language code (e.g., 'en', 'es', 'fr') or 'auto' for auto-detection (default: auto)" }
      },
      "required": ["videoUrl"]
    }
  }
]
```
