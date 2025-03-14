# Madrid Restaurant Data

## Project Overview

This project collects and analyzes restaurant data from Madrid, Spain, for use in a recommendation engine. It leverages Google's Places API to gather restaurant information and reviews, and then applies Google's Natural Language API for sentiment analysis of those reviews.

### Purpose

The primary goal is to create a rich dataset of Madrid restaurants with detailed sentiment analysis of customer reviews. This dataset will power a recommendation engine that can:

- Suggest restaurants based on specific aspects (food quality, service, value, atmosphere)
- Match user preferences with restaurant attributes
- Provide nuanced recommendations beyond simple star ratings
- Offer personalized suggestions based on emotional responses in reviews

### Key Features

- Comprehensive data collection from Madrid's restaurant scene
- Multi-aspect sentiment analysis of customer reviews
- Emotion classification to understand customer experiences
- Structured data output ready for recommendation algorithm training

## Setup

### Prerequisites

- Node.js (v16 or higher)
- pnpm package manager
- Google Places API key
- Google Natural Language API key

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/madrid-restaurants-data.git
   cd madrid-restaurants-data
   ```

2. Install dependencies using pnpm:

   ```bash
   pnpm install
   ```

3. Create a `.env` file in the project root with your API keys:
   ```
   PLACES_API_KEY=your_google_places_api_key
   NLP_API_KEY=your_google_nlp_api_key
   ```

### Running the Application

To collect restaurant data (commented out by default):

```bash
pnpm dev
```

## How data is extracted and why

This section explains the data extraction, processing, and storage pipeline used in the Madrid Restaurant Analysis project.

## Data Sources

### Explicit Data Sources

- **Google Places API**: Primary source for restaurant information in Madrid
  - Provides restaurant details (name, address, location, type, price level, ratings)
  - Provides user reviews with ratings and text
- **Google Natural Language API**: Used for sentiment analysis of reviews
  - Analyzes emotional content and sentiment in review text

### Implicit Data Sources

- Reviews are assumed to be predominantly in English or Spanish (language detection is based on keyword matching)
- Review authenticity is taken at face value from Google Places API

## Data Extraction Process

### Explicit Process

1. **Restaurant Search**:

   - Queries like "best restaurants Madrid" and "popular restaurants Madrid" are sent to Google Places API
   - Location bias configured for Madrid (40.4168° N, 3.7038° W) with a 10km radius

2. **Detail Fetching**:

   - For each restaurant found, a detail request retrieves comprehensive information
   - Specific fields requested include: basic info, attributes (dine-in, takeout options, etc.), and reviews

3. **Sentiment Analysis**:
   - Review text is sent to Google's Natural Language API
   - Overall sentiment (score and magnitude) is extracted
   - Aspect-based sentiment is identified by keyword matching
   - Processes reviews in batches of 10 to avoid API rate limits

### Implicit Process

- Deduplication happens by tracking seen restaurant IDs
- Reviews without text are skipped during sentiment analysis
- Delays between API calls (300ms for Places API, 500ms for Natural Language API) to avoid rate limiting

## Data Tables

### 1. Restaurants Table

```
restaurant_id: Unique identifier for each restaurant
name: Restaurant name
address: Physical address
location_lat/lng: Geographic coordinates
primary_type: Restaurant category
price_level: Cost indicator (0-4)
rating: Overall Google rating
attributes: JSON string of boolean features (dine-in, takeout, etc.)
```

### 2. Ratings Table

```
user_id: Sequential counter (implicit: not tied to real user accounts)
restaurant_id: Links to restaurants table
rating: Numerical rating (typically 1-5)
review_text: The actual review content
date: When review was published
source_user_name: Reviewer's name from Google
```

### 3. Review Sentiment Table

```
review_id: Combines user_id and restaurant_id
overall_score: Sentiment score (-1 to 1)
overall_magnitude: Emotional intensity (0 to inf)
food_score: Sentiment specific to food mentions
service_score: Sentiment specific to service mentions
value_score: Sentiment specific to price/value mentions
ambiance_score: Sentiment specific to atmosphere mentions
language: Detected language ("en" or "es")
emotions: JSON array of identified emotions
```

## Sentiment Analysis Details

### Explicit Analysis

- **Overall Sentiment**: Direct from Google API (score from -1.0 to 1.0, magnitude from 0.0 to infinity)

  - Score: Negative values indicate negative sentiment, positive values indicate positive sentiment
  - Magnitude: Indicates strength of emotional content regardless of positive/negative direction

- **Aspect-Based Sentiment**: Uses sentence-level analysis to isolate opinions on:
  - Food (keywords: "food", "meal", "dish", "taste", etc.)
  - Service (keywords: "service", "staff", "waiter", etc.)
  - Value (keywords: "price", "value", "expensive", etc.)
  - Ambiance (keywords: "ambiance", "atmosphere", "decor", etc.)

### Implicit Analysis

- **Emotion Classification**: Custom mapping of score/magnitude combinations to emotions:
  - Joy: score > 0.7 AND magnitude > 1.5
  - Satisfaction: score 0.5 to 0.7
  - Contentment: score 0 to 0.5
  - Disappointment: score -0.5 to 0
  - Frustration: score -0.7 to -0.5
  - Anger: score < -0.7

## Data Storage

- All data is stored in CSV format for easy analysis
- Each table is stored in a separate file in the `./data` directory:
  - `restaurants.csv`
  - `ratings.csv`
  - `review_sentiment.csv`