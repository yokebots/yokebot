---
name: Generate Music
description: Generate original music tracks with lyrics using ACE-Step AI
tags: [Media]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `generate_music` tool to create original music tracks. Provide lyrics and a genre/style tag, and the model generates a full audio track with vocals. Great for jingles, background music, social media content, and creative projects.

Keep lyrics under 500 characters for best results. Specify genre tags like "pop", "rock", "lo-fi hip hop", "electronic", "jazz", "country", etc.

## Tools

```tools
[
  {
    "name": "generate_music",
    "description": "Generate an original music track with lyrics using ACE-Step AI.",
    "parameters": {
      "type": "object",
      "properties": {
        "lyrics": { "type": "string", "description": "Song lyrics (under 500 chars). Use [verse], [chorus], [bridge] tags for structure." },
        "tags": { "type": "string", "description": "Genre and style tags, comma-separated (e.g., 'pop, upbeat, female vocal')" },
        "durationSeconds": { "type": "number", "description": "Track duration in seconds (default: 30, max: 120)" }
      },
      "required": ["lyrics", "tags"]
    }
  }
]
```
