---
name: Transcribe Audio
description: Real-time speech-to-text via Voxtral Mini 4B Realtime — <500ms latency, 13 languages
tags: [Tools]
source: yokebot
version: 2.0.0
author: YokeBot
---

## Instructions

Use the `transcribe_audio` tool to convert audio or video files to text using Voxtral Mini 4B Realtime by Mistral AI. Supports 13 languages with real-time streaming capability and <500ms latency. Provides timestamps for segmentation.

Provide the audio file URL. Results include timestamps for easy navigation.

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
