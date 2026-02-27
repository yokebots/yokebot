---
name: Annotate Video Transcript
description: Summarize and annotate video transcripts with timestamps and key moments
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `annotate_video_transcript` tool to process video or meeting transcripts. It identifies key moments, creates chapter markers with timestamps, extracts action items, and generates a structured summary.

Preserve timestamp references. Highlight decisions, questions, and action items separately.

## Tools

```tools
[
  {
    "name": "annotate_video_transcript",
    "description": "Annotate a video transcript with key moments, chapters, and action items.",
    "parameters": {
      "type": "object",
      "properties": {
        "transcript": { "type": "string", "description": "The video/meeting transcript text (with timestamps if available)" },
        "outputType": { "type": "string", "description": "Output type: 'chapters', 'summary', 'action-items', 'full' (default: full)" }
      },
      "required": ["transcript"]
    }
  }
]
```
