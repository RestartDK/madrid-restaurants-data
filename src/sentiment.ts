import { LanguageServiceClient } from "@google-cloud/language";
import { Rating, ReviewSentiment } from "./types";

/**
 * Simple language detection function based on text content
 */
export function detectLanguage(text: string): string {
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
export async function analyzeReviewSentiment(
	reviews: Rating[],
	apiKey: string
): Promise<ReviewSentiment[]> {
	// Create a client
	const client = new LanguageServiceClient({
		clientOptions: { apiKey },
	});
	const results: ReviewSentiment[] = [];

	// Process reviews in batches to avoid rate limits
	const batchSize = 10;

	console.log(`Analyzing sentiment for ${reviews.length} reviews...`);

	// Create a mapping for new unique review IDs
	const reviewMap = new Map<string, string>();
	let nextReviewId = 1;

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

				// Create a unique review ID if we haven't seen this review
				const key = `${review.user_id}_${review.restaurant_id}_${review.date}`;
				if (!reviewMap.has(key)) {
					reviewMap.set(key, `${nextReviewId++}`);
				}

				return {
					review_id: reviewMap.get(key)!,
					user_id: review.user_id,                    // Keep the global user ID
					restaurant_id: review.restaurant_id,        // Keep the restaurant ID
					overall_score: sentiment?.score || 0,
					overall_magnitude: sentiment?.magnitude || 0,
					food_score: foodScore || 0,
					service_score: serviceScore || 0,
					value_score: valueScore || 0,
					ambiance_score: ambianceScore || 0,
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