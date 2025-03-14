import * as dotenv from "dotenv";
import * as fs from "fs";
import { writeToCSV, readFromCSV } from "./utils";
import { analyzeReviewSentiment } from "./sentiment";
import { collectRestaurantsInMadrid } from "./places";

// Load environment variables
dotenv.config();

// Initialize all env variables here
const PLACES_API_KEY = process.env.PLACES_API_KEY;
if (!PLACES_API_KEY) {
	throw Error("No Google Maps API key set");
}

const NLP_API_KEY = process.env.NLP_API_KEY;
if (!NLP_API_KEY) {
	throw Error("No Google NLP API key set");
}

/**
 * Main application function
 */
async function main() {
	try {
		// Create data directory if it doesn't exist
		if (!fs.existsSync("./data")) {
			fs.mkdirSync("./data");
		}

		// Since we've already validated API keys exist, we can safely assert they're not undefined
		const placesApiKey = PLACES_API_KEY as string;
		const nlpApiKey = NLP_API_KEY as string;

		// Collect real restaurant data and reviews from Madrid
		console.log("Collecting restaurant data from Madrid...");
		const { restaurants, reviews } = await collectRestaurantsInMadrid(placesApiKey, 5); // Start with 5 restaurants for testing
		
		console.log(`Collected ${restaurants.length} restaurants with ${reviews.length} reviews.`);
		
		// Write data to CSV files
		writeToCSV(restaurants, './data/restaurants.csv');
		writeToCSV(reviews, './data/ratings.csv');

		// Add sentiment analysis
		console.log("Analyzing sentiment in reviews...");
		const sentimentResults = await analyzeReviewSentiment(reviews, nlpApiKey);
		writeToCSV(sentimentResults, "./data/review_sentiment.csv");

		console.log(`Analyzed sentiment for ${sentimentResults.length} reviews.`);
		console.log("Data collection and analysis complete!");
	} catch (error) {
		console.error("Application error:", error);
	}
}

// Run the main function
main();
