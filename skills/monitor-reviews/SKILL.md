---
name: Monitor Reviews
description: Check Google and Yelp reviews for business locations
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google-places]
---

## Instructions

Use the `monitor_reviews` tool to fetch and monitor customer reviews from Google Places. Track review ratings, sentiment trends, and new reviews for business locations.

Summarize review themes and sentiment. Flag negative reviews that need urgent attention.

## Tools

```tools
[
  {
    "name": "monitor_reviews",
    "description": "Fetch and monitor customer reviews from Google Places.",
    "parameters": {
      "type": "object",
      "properties": {
        "placeId": { "type": "string", "description": "Google Place ID for the business" },
        "businessName": { "type": "string", "description": "Business name to search for (alternative to placeId)" },
        "sortBy": { "type": "string", "description": "Sort reviews by: 'newest', 'highest', 'lowest', 'relevant' (default: newest)" },
        "minRating": { "type": "number", "description": "Filter reviews by minimum rating (1-5)" }
      },
      "required": []
    }
  }
]
```
