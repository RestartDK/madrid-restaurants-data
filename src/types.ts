export interface Restaurant {
	restaurant_id: string;
	name: string;
	address: string;
	location_lat: number;
	location_lng: number;
	primary_type: string;
	price_level: number;
	rating: number;
	attributes: string; // JSON string
}

export interface User {
	user_id: number;
	preferences: string; // JSON string
}

export interface Rating {
	user_id: number;
	restaurant_id: string;
	rating: number;
	review_text: string;
	date: string;
	source_user_name: string; // Name of the reviewer from Google
}

export interface UserInteraction {
	user_id: number;
	restaurant_id: string;
	type: string;
	timestamp: string;
	duration: number;
}

export interface ReviewSentiment {
  review_id: string;
  overall_score: number;
  overall_magnitude: number;
  food_score: number | null;
  service_score: number | null;
  value_score: number | null;
  ambiance_score: number | null;
  language: string;
  emotions: string; // JSON string of emotions
}