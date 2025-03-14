import { PlacesClient } from "@googlemaps/places";
import type { google } from "@googlemaps/places/build/protos/protos";
import { Rating, Restaurant } from "./types";

/**
 * Convert Google Places object to Restaurant type
 */
export function convertToRestaurant(
	place: google.maps.places.v1.IPlace
): Restaurant {
	// Extract ID from place.name (format: "places/PLACE_ID")
	const restaurant_id = place.id || place.name?.split("/").pop() || "";

	// Create attributes JSON with available boolean flags
	const attributes: Record<string, boolean | number> = {
		dineIn: !!place.dineIn,
		takeout: !!place.takeout,
		delivery: !!place.delivery,
		outdoorSeating: !!place.outdoorSeating,
		reservable: !!place.reservable,
		userRatingCount: place.userRatingCount || 0,
	};

	return {
		restaurant_id,
		name: place.displayName?.text || "",
		address: place.formattedAddress || "",
		location_lat: place.location?.latitude || 0,
		location_lng: place.location?.longitude || 0,
		primary_type: place.primaryTypeDisplayName?.text || "",
		price_level: typeof place.priceLevel === "number" ? place.priceLevel : 0,
		rating: typeof place.rating === "number" ? place.rating : 0,
		attributes: JSON.stringify(attributes),
	};
}

/**
 * Search for places using Google Places API
 */
export async function searchPlaces(
	query: string,
	apiKey: string,
	locationBias?: any
): Promise<google.maps.places.v1.IPlace[]> {
	const placesClient = new PlacesClient({
		clientOptions: {
			apiKey,
		},
	});

	const request: google.maps.places.v1.ISearchTextRequest = {
		textQuery: query,
		locationBias,
	};

	// Set the field mask to specify which fields to return
	const otherArgs = {
		headers: {
			"X-Goog-FieldMask":
				"places.displayName,places.id,places.formattedAddress,places.location",
		},
	};

	try {
		const response = await placesClient.searchText(request, { otherArgs });
		return response[0].places || [];
	} catch (error) {
		console.error("Error searching for places:", error);
		throw error;
	}
}

/**
 * Fetch detailed information about a specific place
 */
export async function fetchPlaceInfo(
	placeId: string,
	apiKey: string,
	fields: string[] = [
		"displayName",
		"id",
		"formattedAddress",
		"location",
		"rating",
		"primaryTypeDisplayName",
		"priceLevel",
		"dineIn",
		"takeout",
		"delivery",
		"outdoorSeating",
		"reservable",
		"reviews",
		"userRatingCount",
	]
): Promise<google.maps.places.v1.IPlace> {
	const placesClient = new PlacesClient({
		clientOptions: {
			apiKey,
		},
	});

	const name = `places/${placeId}`;
	const request: google.maps.places.v1.IGetPlaceRequest = {
		name,
	};

	// Set the field mask as an otherArgs parameter
	const otherArgs = {
		headers: {
			"X-Goog-FieldMask": fields.join(","),
		},
	};

	try {
		const response = await placesClient.getPlace(request, { otherArgs });
		return response[0];
	} catch (error) {
		console.error("Error fetching place details:", error);
		throw error;
	}
}

/**
 * Extract review data from a place
 */
export function extractReviews(place: google.maps.places.v1.IPlace): Rating[] {
	const restaurant_id = place.id || place.name?.split("/").pop() || "";
	const reviews: Rating[] = [];

	if (!place.reviews || place.reviews.length === 0) {
		return reviews;
	}

	// Use a counter as user_id since we don't have real user accounts
	let counter = 1;

	place.reviews.forEach((review) => {
		if (!review) return;

		// Since the Google Places API types are causing issues, we'll use any
		// to handle the review data safely
		const reviewAny = review;

		// Extract data with safety checks
		const authorName =
			reviewAny.authorAttribution?.displayName ||
			reviewAny.authorAttribution?.displayName ||
			"Anonymous";

		const reviewRating = reviewAny.rating || 0;

		const reviewText = reviewAny.text?.text || reviewAny.text || "";

		// Use current date as fallback
		let dateStr = new Date().toISOString();

		if (reviewAny.publishTime) {
			if (typeof reviewAny.publishTime === "string") {
				dateStr = reviewAny.publishTime;
			} else if (reviewAny.publishTime.seconds) {
				// Convert timestamp to milliseconds
				const millis = Number(reviewAny.publishTime.seconds) * 1000;
				dateStr = new Date(millis).toISOString();
			}
		}

		// Convert timestamp to date (YYYY-MM-DD)
		const date = dateStr.split("T")[0];

		reviews.push({
			user_id: counter++,
			restaurant_id,
			rating: reviewRating,
			review_text: reviewText.toString(),
			date,
			source_user_name: authorName,
		});
	});

	return reviews;
}

/**
 * Collect restaurant data from Madrid
 */
export async function collectRestaurantsInMadrid(
	apiKey: string,
	count: number = 50
): Promise<{ restaurants: Restaurant[]; reviews: Rating[] }> {
	console.log(`Searching for restaurants in Madrid...`);

	// Create location bias for Madrid
	const madridLocation = {
		circle: {
			center: {
				latitude: 40.4168,
				longitude: -3.7038,
			},
			radius: 10000.0, // 10km radius to get more restaurants
		},
	};

	// We'll make multiple queries to get different types of restaurants
	const queries = [
		"best restaurants Madrid",
		"popular restaurants Madrid",
		// "spanish restaurants Madrid",
		// "tapas Madrid",
		// "fine dining Madrid",
		// "paella Madrid",
		// "seafood Madrid",
		// "steakhouse Madrid",
		// "italian Madrid",
		// "asian Madrid"
	];

	const allRestaurants: Restaurant[] = [];
	const allReviews: Rating[] = [];
	const seenIds = new Set<string>();

	for (const query of queries) {
		if (allRestaurants.length >= count) break;

		console.log(`Searching for: ${query}`);
		const searchResults = await searchPlaces(query, apiKey, madridLocation);

		for (const place of searchResults) {
			if (allRestaurants.length >= count) break;

			const placeId = place.id || place.name?.split("/").pop();
			if (!placeId || seenIds.has(placeId)) continue;

			try {
				console.log(`Fetching details for: ${place.displayName?.text}`);
				const placeDetails = await fetchPlaceInfo(placeId, apiKey);
				const restaurant = convertToRestaurant(placeDetails);
				const reviews = extractReviews(placeDetails);

				allRestaurants.push(restaurant);
				allReviews.push(...reviews);
				seenIds.add(placeId);

				console.log(`Found ${reviews.length} reviews for ${restaurant.name}`);

				// Add a small delay to avoid hitting API rate limits
				await new Promise((resolve) => setTimeout(resolve, 300));
			} catch (error) {
				console.error(
					`Error fetching details for ${place.displayName?.text}:`,
					error
				);
			}
		}
	}

	return { restaurants: allRestaurants, reviews: allReviews };
}
