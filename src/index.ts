import * as dotenv from "dotenv";
import { PlacesClient } from "@googlemaps/places";
import { LanguageServiceClient } from "@google-cloud/language";
import type { google } from "@googlemaps/places/build/protos/protos";
import * as fs from "fs";
import * as path from "path";
import { Rating, Restaurant, ReviewSentiment } from "./types";
import { readFromCSV } from "./utils";

dotenv.config();

// Initialize all env variables here
const API_URL = process.env.PLACES_API_URL;
if (!API_URL) {
	throw Error("No API URL set");
}

const PLACES_API_KEY = process.env.PLACES_API_KEY;
if (!PLACES_API_KEY) {
	throw Error("No Google Maps API key set");
}

const NLP_API_KEY = process.env.NLP_API_KEY;
if (!NLP_API_KEY) {
	throw Error("No Google Maps API key set");
}

async function searchPlaces(
	query: string,
	locationBias?: any
): Promise<google.maps.places.v1.IPlace[]> {
	const placesClient = new PlacesClient({
		clientOptions: {
			apiKey: PLACES_API_KEY,
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

async function fetchPlaceInfo(
	placeId: string,
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
		"reviews", // Include real reviews
		"userRatingCount",
	]
): Promise<google.maps.places.v1.IPlace> {
	const placesClient = new PlacesClient({
		clientOptions: {
			apiKey: PLACES_API_KEY,
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

// Function to convert Place object to our Restaurant schema
function convertToRestaurant(place: google.maps.places.v1.IPlace): Restaurant {
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

// Function to extract review data from a place
function extractReviews(place: google.maps.places.v1.IPlace): Rating[] {
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

// Function to write data to CSV
function writeToCSV<T extends Record<string, any>>(
	data: T[],
	filename: string
): void {
	if (data.length === 0) {
		console.log(`No data to write to ${filename}`);
		return;
	}

	// Create headers from the first object's keys
	const headers = Object.keys(data[0]).join(",");

	// Convert each object to a CSV row
	const rows = data.map((item) => {
		return Object.values(item)
			.map((value) => {
				// If the value is a string that might contain commas, wrap it in quotes
				if (
					typeof value === "string" &&
					(value.includes(",") || value.includes('"') || value.includes("\n"))
				) {
					return `"${value.replace(/"/g, '""')}"`;
				}
				return value;
			})
			.join(",");
	});

	// Combine headers and rows
	const csv = [headers, ...rows].join("\n");

	// Ensure the directory exists
	const dir = path.dirname(filename);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	// Write to file
	fs.writeFileSync(filename, csv);
	console.log(`Data written to ${filename}`);
}

async function collectRestaurantsInMadrid(
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
		const searchResults = await searchPlaces(query, madridLocation);

		for (const place of searchResults) {
			if (allRestaurants.length >= count) break;

			const placeId = place.id || place.name?.split("/").pop();
			if (!placeId || seenIds.has(placeId)) continue;

			try {
				console.log(`Fetching details for: ${place.displayName?.text}`);
				const placeDetails = await fetchPlaceInfo(placeId);
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

/**
 * Simple language detection function based on text content
 */
function detectLanguage(text: string): string {
	// Spanish keywords
	const spanishWords = [
		"el",
		"la",
		"los",
		"las",
		"un",
		"una",
		"es",
		"son",
		"y",
		"o",
		"pero",
		"muy",
		"bueno",
		"buena",
		"malo",
		"mala",
		"comida",
		"servicio",
		"restaurante",
		"excelente",
		"bien",
		"mal",
	];

	// Count Spanish words
	const words = text.toLowerCase().split(/\s+/);
	const spanishWordCount = words.filter((word) =>
		spanishWords.includes(word)
	).length;

	// If at least 2 Spanish words or 10% of all words are Spanish, classify as Spanish
	if (spanishWordCount >= 2 || spanishWordCount / words.length > 0.1) {
		return "es";
	}

	// Default to English
	return "en";
}

/**
 * Analyze sentiment in restaurant reviews using Google Cloud Natural Language API
 */
async function analyzeReviewSentiment(
	reviews: Rating[]
): Promise<ReviewSentiment[]> {
	// Create a client
	const client = new LanguageServiceClient({
		clientOptions: { apiKey: NLP_API_KEY },
	});
	const results: ReviewSentiment[] = [];

	// Process reviews in batches to avoid rate limits
	const batchSize = 10;

	console.log(`Analyzing sentiment for ${reviews.length} reviews...`);

	for (let i = 0; i < reviews.length; i += batchSize) {
		const batch = reviews.slice(i, i + batchSize);
		console.log(
			`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
				reviews.length / batchSize
			)}`
		);

		// Process each review in the batch
		const batchPromises = batch.map(async (review) => {
			try {
				// Skip empty reviews
				if (!review.review_text || review.review_text.trim() === "") {
					return null;
				}

				// Create request document
				const document = {
					content: review.review_text,
					type: "PLAIN_TEXT" as const,
				};

				// Analyze overall sentiment
				const [sentimentResult] = await client.analyzeSentiment({ document });
				const sentiment = sentimentResult.documentSentiment;

				// Track aspect-related terms to find food, service and value sentiment
				const foodTerms = [
					"food",
					"meal",
					"dish",
					"taste",
					"flavor",
					"menu",
					"cuisine",
					"delicious",
					"comida",
					"plato",
				];
				const serviceTerms = [
					"service",
					"staff",
					"waiter",
					"waitress",
					"server",
					"attention",
					"friendly",
					"servicio",
					"atención",
				];
				const valueTerms = [
					"price",
					"value",
					"expensive",
					"cheap",
					"worth",
					"cost",
					"affordable",
					"precio",
					"caro",
					"barato",
				];
				const ambianceTerms = [
					"ambiance",
					"atmosphere",
					"decor",
					"environment",
					"music",
					"noise",
					"vibe",
					"ambiente",
					"decoración",
				];

				let foodScore = null;
				let serviceScore = null;
				let valueScore = null;
				let ambianceScore = null;

				// Analyze sentence-level sentiment to extract aspect-based sentiment
				const sentences = sentimentResult.sentences || [];
				for (const sentence of sentences) {
					const text = sentence.text?.content?.toLowerCase() || "";
					const sentenceScore = sentence.sentiment?.score || 0;

					// Check if sentence contains aspect-related terms
					if (foodTerms.some((term) => text.includes(term))) {
						foodScore =
							foodScore === null
								? sentenceScore
								: (foodScore + sentenceScore) / 2;
					}

					if (serviceTerms.some((term) => text.includes(term))) {
						serviceScore =
							serviceScore === null
								? sentenceScore
								: (serviceScore + sentenceScore) / 2;
					}

					if (valueTerms.some((term) => text.includes(term))) {
						valueScore =
							valueScore === null
								? sentenceScore
								: (valueScore + sentenceScore) / 2;
					}

					if (ambianceTerms.some((term) => text.includes(term))) {
						ambianceScore =
							ambianceScore === null
								? sentenceScore
								: (ambianceScore + sentenceScore) / 2;
					}
				}

				// Detect language
				const language = detectLanguage(review.review_text);

				// Map sentiment scores to emotions (simplified approach)
				const emotions = [];
				const score = sentiment?.score || 0;
				const magnitude = sentiment?.magnitude || 0;

				if (score > 0.7 && magnitude > 1.5) emotions.push("joy");
				if (score > 0.5 && score <= 0.7) emotions.push("satisfaction");
				if (score > 0 && score <= 0.5) emotions.push("contentment");
				if (score < 0 && score >= -0.5) emotions.push("disappointment");
				if (score < -0.5 && score >= -0.7) emotions.push("frustration");
				if (score < -0.7) emotions.push("anger");

				// Create review_id from user_id and restaurant_id
				const review_id = `${review.user_id}_${review.restaurant_id}`;

				return {
					review_id,
					overall_score: sentiment?.score || 0,
					overall_magnitude: sentiment?.magnitude || 0,
					food_score: foodScore,
					service_score: serviceScore,
					value_score: valueScore,
					ambiance_score: ambianceScore,
					language,
					emotions: JSON.stringify(emotions),
				};
			} catch (error) {
				console.error(`Error analyzing review: ${error}`);
				return null;
			}
		});

		// Wait for all reviews in this batch to be processed
		const batchResults = await Promise.all(batchPromises);

		// Add valid results to the results array
		batchResults.forEach((result) => {
			if (result) results.push(result);
		});

		// Avoid rate limiting with a small delay between batches
		if (i + batchSize < reviews.length) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	return results;
}

/**
 * Read data from a CSV file and convert it to objects
 */

/**
 * Parse a CSV line respecting quoted fields that may contain commas
 */

async function main() {
	try {
		// Create data directory if it doesn't exist
		if (!fs.existsSync("./data")) {
			fs.mkdirSync("./data");
		}

		// // Collect real restaurant data and reviews from Madrid
		// console.log("Collecting restaurant data from Madrid...");
		// const { restaurants, reviews } = await collectRestaurantsInMadrid(5); // Start with 5 restaurants for testing
		//
		// console.log(`Collected ${restaurants.length} restaurants with ${reviews.length} reviews.`);
		//
		// // Write data to CSV files
		// writeToCSV(restaurants, './data/restaurants.csv');
		// writeToCSV(reviews, './data/ratings.csv');

		// Read existing reviews from CSV file
		console.log("Reading reviews from CSV file...");
		const reviews = readFromCSV<Rating>("./data/ratings.csv");
		console.log(`Read ${reviews.length} reviews from CSV file.`);

		// Add sentiment analysis
		console.log("Analyzing sentiment in reviews...");
		const sentimentResults = await analyzeReviewSentiment(reviews);
		writeToCSV(sentimentResults, "./data/review_sentiment.csv");

		console.log(`Analyzed sentiment for ${sentimentResults.length} reviews.`);
		console.log("Data collection and analysis complete!");
	} catch (error) {
		console.error("Application error:", error);
	}
}

// Run the main function
main();
