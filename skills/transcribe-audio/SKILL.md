---
name: Transcribe Audio
description: Convert audio and video to text with timestamps via OpenAI Whisper
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [openai]
---

## Instructions

Use the `transcribe_audio` tool to convert audio or video files to text using OpenAI's Whisper API. Supports multiple languages and provides timestamps for segmentation.

Provide the audio file URL or base64 data. Results include timestamps for easy navigation.

## Tools

```tools
[
  {
    "name": "transcribe_audio",
    "description": "Transcribe audio/video to text via OpenAI Whisper.",
    "parameters": {
      "type": "object",
      "properties": {
        "audioUrl": { "type": "string", "description": "URL of the audio/video file to transcribe" },
        "language": { "type": "string", "description": "Language code (e.g., 'en', 'es', 'fr') or 'auto' for auto-detection (default: auto)" },
        "format": { "type": "string", "description": "Output format: 'text', 'srt', 'vtt', 'verbose' (default: verbose)" },
        "prompt": { "type": "string", "description": "Optional prompt to guide transcription (e.g., proper nouns, technical terms)" }
      },
      "required": ["audioUrl"]
    }
  }
]
```
