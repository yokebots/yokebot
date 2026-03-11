---
name: Search Properties
description: Search real estate listings by location, price, bedrooms, and property type
tags: [Data]
source: yokebot
version: 1.0.0
author: YokeBot
credentials:
  - id: firecrawl
    name: Firecrawl
    description: API key for web scraping (firecrawl.dev)
---

## Instructions

Use the `search_properties` tool to search real estate listings. Provide a location and optional filters to find properties for sale or rent.

Results include property details like price, bedrooms, square footage, and listing links. Useful for real estate agents, investors, and market research.

## Tools

```tools
[
  {
    "name": "search_properties",
    "description": "Search real estate listings by location with optional price, bedroom, and property type filters.",
    "parameters": {
      "type": "object",
      "properties": {
        "location": { "type": "string", "description": "City, neighborhood, ZIP code, or address to search" },
        "listingType": { "type": "string", "description": "Type of listing: 'for_sale' or 'for_rent' (default: for_sale)" },
        "minPrice": { "type": "number", "description": "Minimum price filter" },
        "maxPrice": { "type": "number", "description": "Maximum price filter" },
        "beds": { "type": "number", "description": "Minimum number of bedrooms" },
        "propertyType": { "type": "string", "description": "Property type: 'house', 'condo', 'townhouse', 'apartment', 'land'" }
      },
      "required": ["location"]
    }
  }
]
```
