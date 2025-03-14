import { PlacesClient } from "@googlemaps/places";
import type { google } from "@googlemaps/places/build/protos/protos";
import { Rating, Restaurant } from "./types";
import * as fs from "fs";
import { readFromCSV, writeToCSV } from "./utils";

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
 * Collect restaurant data from Madrid with automatic incremental collection
 */
export async function collectRestaurantsInMadrid(
	apiKey: string,
	targetCount: number = 50,
	dataDir: string = './data',
	existingIds?: Set<string>
): Promise<{ restaurants: Restaurant[]; reviews: Rating[]; newlyCollected: { restaurants: number, reviews: number } }> {
	// Create data directory if it doesn't exist
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir);
	}
	
	// Load existing data if not provided
	let existingRestaurants: Restaurant[] = [];
	let existingReviews: Rating[] = [];
	
	if (!existingIds) {
		// Check if we have existing data files
		if (fs.existsSync(`${dataDir}/restaurants.csv`)) {
			existingRestaurants = readFromCSV<Restaurant>(`${dataDir}/restaurants.csv`);
			console.log(`Loaded ${existingRestaurants.length} existing restaurants`);
		}
		
		if (fs.existsSync(`${dataDir}/ratings.csv`)) {
			existingReviews = readFromCSV<Rating>(`${dataDir}/ratings.csv`);
			console.log(`Loaded ${existingReviews.length} existing reviews`);
		}
		
		// Extract existing IDs
		existingIds = new Set(existingRestaurants.map(r => r.restaurant_id));
	}
	
	// Calculate how many more restaurants we need
	const remainingCount = Math.max(0, targetCount - existingRestaurants.length);
	
	if (remainingCount <= 0) {
		console.log(`Already have ${existingRestaurants.length} restaurants, which meets or exceeds the target of ${targetCount}`);
		return { 
			restaurants: existingRestaurants, 
			reviews: existingReviews,
			newlyCollected: { restaurants: 0, reviews: 0 }
		};
	}
	
	console.log(`Searching for restaurants in Madrid (target: ${targetCount}, need ${remainingCount} more)...`);
	console.log(`Already have ${existingIds.size} existing restaurant IDs to avoid duplicates`);

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

	// Expanded list of queries to get more diverse results
	const queries = [
		"best restaurants Madrid",
		"popular restaurants Madrid",
		"spanish restaurants Madrid",
		"tapas Madrid",
		"fine dining Madrid",
		"paella Madrid",
		"seafood Madrid",
		"steakhouse Madrid",
		"italian Madrid",
		"asian Madrid",
		"michelin star Madrid",
		"authentic Madrid",
		"cheap eats Madrid",
		"brunch Madrid",
		"vegetarian Madrid",
		"chinese Madrid",
		"japanese Madrid",
		"indian Madrid",
		"mexican Madrid",
		"mediterranean Madrid",
		"restaurants Salamanca Madrid",
		"restaurants Malasaña Madrid",
		"restaurants Chueca Madrid",
		"restaurants La Latina Madrid",
		"restaurants Retiro Madrid"
	];

	// Initialize seenIds with existing IDs to avoid duplicates
	const seenIds = new Set<string>(existingIds);
	const newRestaurants: Restaurant[] = [];
	const newReviews: Rating[] = [];

	// Process each query until we reach the target count
	for (const query of queries) {
		if (newRestaurants.length >= remainingCount) break;

		console.log(`Searching for: "${query}" (current count: ${newRestaurants.length}/${remainingCount})`);
		
		try {
			const searchResults = await searchPlaces(query, apiKey, madridLocation);
			console.log(`Found ${searchResults.length} results for query "${query}"`);
			
			// Process each place found
			for (const place of searchResults) {
				if (newRestaurants.length >= remainingCount) break;

				const placeId = place.id || place.name?.split("/").pop();
				if (!placeId || seenIds.has(placeId)) continue;

				try {
					console.log(`Fetching details for: ${place.displayName?.text} (${newRestaurants.length + 1}/${remainingCount})`);
					const placeDetails = await fetchPlaceInfo(placeId, apiKey);
					const restaurant = convertToRestaurant(placeDetails);
					const reviews = extractReviews(placeDetails);

					newRestaurants.push(restaurant);
					newReviews.push(...reviews);
					seenIds.add(placeId);

					console.log(`Found ${reviews.length} reviews for ${restaurant.name}`);

					// Add a small delay to avoid hitting API rate limits
					await new Promise((resolve) => setTimeout(resolve, 300));
				} catch (error) {
					console.error(`Error fetching details for ${place.displayName?.text}:`, error);
				}
			}
			
			// Add a delay between queries to avoid rate limits
			await new Promise((resolve) => setTimeout(resolve, 500));
			
		} catch (error) {
			console.error(`Error with query "${query}":`, error);
			// Wait longer if we hit an error (might be rate limiting)
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	console.log(`Completed search with ${newRestaurants.length} new unique restaurants.`);
	
	// Combine with existing data
	const allRestaurants = [...existingRestaurants, ...newRestaurants];
	const allReviews = [...existingReviews, ...newReviews];
	
	// Save the combined data
	writeToCSV(allRestaurants, `${dataDir}/restaurants.csv`);
	writeToCSV(allReviews, `${dataDir}/ratings.csv`);
	
	console.log(`Total: ${allRestaurants.length} restaurants with ${allReviews.length} reviews`);
	
	return { 
		restaurants: allRestaurants, 
		reviews: allReviews,
		newlyCollected: {
			restaurants: newRestaurants.length,
			reviews: newReviews.length
		}
	};
}
