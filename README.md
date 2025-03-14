# TODO

- [X] Determine the structure you need for the datatable
- [ ] Discuss with team if the data table is good and the format checks out
- [ ] First get the basic data in a table with some explicit
- [ ] For implicit data and specifically the review sentiment, now make an algorithm to get the sentiment analysis of each review for the users
- [ ] Implement a test version with 5 results
- [ ] Check the API limits and then store the information in a csv

### Data table for chatbots

Restaurants:
- restaurant_id         # Unique identifier from Google Places
- name                  # Restaurant name
- address               # Full address in Madrid
- location_lat/lng      # Geographic coordinates
- primary_type          # Main cuisine type (e.g., "Spanish")
- price_level           # Price category (1-4)
- rating                # Average rating (1-5)
- attributes            # JSON field for features (outdoor seating, etc.)

Ratings:
- user_id               # Who gave the rating
- restaurant_id         # Which restaurant
- rating                # Numerical rating (1-5)
- review_text           # Written review
- date                  # When submitted

User_Interactions:
- user_id               # Who interacted
- restaurant_id         # Which restaurant
- type                  # View, click, bookmark, etc.
- timestamp             # When it happened
- duration              # Time spent viewing (if applicable)

<!-- This is to get better implicit feedback -->
<!-- Review_Sentiment:
- review_id             # Which review
- overall_score         # General sentiment (-1 to +1)
- food_score            # Food quality sentiment
- service_score         # Service quality sentiment
- value_score           # Price/value sentiment
- emotions              # JSON array of emotions detected ("joy", "disappointment") -->

<!-- This could be if it is an ACTIVE recommender -->
<!-- Recommendations:
- user_id               # Who received recommendation
- restaurant_id         # What was recommended
- score                 # Confidence score
- was_clicked           # If user engaged with it -->