import * as dotenv from "dotenv";
import * as fs from "fs";
import { writeToCSV, readFromCSV } from "./utils";
import { analyzeReviewSentiment } from "./sentiment";
import { collectRestaurantsInMadrid } from "./places";
import { ReviewSentiment } from "./types";

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
		const placesApiKey = PLACES_API_KEY as string;
		const nlpApiKey = NLP_API_KEY as string;

		// Target number of restaurants to collect
		const targetCount = 500; // Change this to your desired count (e.g., 500)
		
		console.log(`Starting collection process with target of ${targetCount} restaurants...`);
		const { restaurants, reviews, newlyCollected } = await collectRestaurantsInMadrid(
			placesApiKey,
			targetCount
		);
	
		console.log(`Collection complete: ${restaurants.length} total restaurants (${newlyCollected.restaurants} newly collected)`);
		
		// Only analyze sentiment for newly collected reviews to save time and API costs
		if (newlyCollected.reviews > 0) {
			console.log(`Analyzing sentiment for ${newlyCollected.reviews} new reviews...`);
			
			// Extract just the newly collected reviews for sentiment analysis
			const newReviews = reviews.slice(reviews.length - newlyCollected.reviews);
			const sentimentResults = await analyzeReviewSentiment(newReviews, nlpApiKey);
			
			// Append new sentiment results to existing file or create new one
			if (fs.existsSync('./data/review_sentiment.csv')) {
				const existingSentiment = readFromCSV<ReviewSentiment>('./data/review_sentiment.csv');
				writeToCSV([...existingSentiment, ...sentimentResults], './data/review_sentiment.csv');
			} else {
				writeToCSV(sentimentResults, './data/review_sentiment.csv');
			}
			
			console.log(`Analyzed sentiment for ${sentimentResults.length} reviews`);
		} else {
			console.log('No new reviews to analyze');
		}
		
		console.log("Data collection and analysis complete!");
	} catch (error) {
		console.error("Application error:", error);
	}
}

// Run the main function
main();
