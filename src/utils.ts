import * as fs from "fs";
import * as path from "path";
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { Rating, ReviewSentiment } from "./types";

/**
 * Read data from a CSV file and convert to objects
 */
export function readFromCSV<T>(filename: string): T[] {
	if (!fs.existsSync(filename)) {
		console.log(`File not found: ${filename}`);
		return [];
	}

	const csvData = fs.readFileSync(filename, "utf-8");
	
	// Parse CSV data to objects with headers as keys
	const records = parse(csvData, {
		columns: true,           // Use first row as column names
		skip_empty_lines: true,  // Skip empty lines
		cast: true,              // Auto-convert strings to numbers when possible
		trim: true               // Trim whitespace from fields
	});
	
	return records as T[];
}

/**
 * Write data to a CSV file
 */
export function writeToCSV<T extends Record<string, any>>(
	data: T[],
	filename: string
): void {
	if (data.length === 0) {
		console.log(`No data to write to ${filename}`);
		return;
	}

	// Convert objects to CSV string
	const csvString = stringify(data, {
		header: true,            // Include header row
		quoted: true,            // Quote all fields
		quoted_empty: true       // Quote empty fields
	});

	// Ensure the directory exists
	const dir = path.dirname(filename);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	// Write to file
	fs.writeFileSync(filename, csvString);
	console.log(`Data written to ${filename}`);
}

/**
 * Reassign user IDs to make them unique across all ratings
 */
export function reassignUserIds(ratings: Rating[]): Rating[] {
	// Create a mapping from original composite keys to new unique IDs
	const userMap = new Map<string, number>();
	let nextUserId = 1;
	
	// Create a copy of the ratings with updated user IDs
	const updatedRatings = ratings.map(rating => {
		// Create a composite key using source_user_name and restaurant_id
		const compositeKey = rating.source_user_name;
		
		// If we haven't seen this user before, assign a new ID
		if (!userMap.has(compositeKey)) {
			userMap.set(compositeKey, nextUserId++);
		}

		console.log(rating);
		console.log(userMap);
		
		// Return a new rating object with the updated user_id
		return {
			...rating,
			user_id: userMap.get(compositeKey)!
		};
	});
	
	console.log(`Reassigned ${ratings.length} ratings to ${userMap.size} unique users`);
	return updatedRatings;
}

/**
 * Reassign reviewSentiment IDs to make them unique
 */
export function reassignReviewSentimentIds(
    sentimentReviews: ReviewSentiment[],
    oldRatings: Rating[],
    newRatings: Rating[]
): ReviewSentiment[] {
    // Create a mapping for new unique review IDs
    const reviewMap = new Map<string, string>();
    let nextReviewId = 1;

    // Create a mapping of old_user_id + restaurant_id -> new global user_id
    const newUserMapping = new Map<string, number>();
    oldRatings.forEach(oldRating => {
        const matchingNewRating = newRatings.find(
            newRating => 
                newRating.restaurant_id === oldRating.restaurant_id && 
                newRating.review_text === oldRating.review_text
        );
        if (matchingNewRating) {
            const key = `${oldRating.user_id}_${oldRating.restaurant_id}`;
            newUserMapping.set(key, matchingNewRating.user_id);
        }
    });

    return sentimentReviews.map(sentiment => {
        // The current review_id is in format: <old_user_id>_<restaurant_id>
        const [relativeUserId, restaurantId] = sentiment.review_id.split('_');
        
        // Get the new global user ID using the old ID + restaurant combination
        const key = `${relativeUserId}_${restaurantId}`;
        const globalUserId = newUserMapping.get(key) || 0;

        // Create a unique review ID if we haven't seen this review
        if (!reviewMap.has(key)) {
            reviewMap.set(key, `${nextReviewId++}`);
        }

        return {
            ...sentiment,
						restaurant_id: restaurantId,
            user_id: globalUserId,                      // The new global user ID
            review_id: reviewMap.get(key)!              // New unique review ID
        };
    });
}

/**
 * Remove rows where user_id or review_id is 0
 */
export function cleanInvalidIds<T extends { user_id?: number, review_id?: string }>(
    data: T[],
    type: 'ratings' | 'sentiment'
): T[] {
    const originalCount = data.length;
    let cleanedData: T[];

    if (type === 'ratings') {
        cleanedData = data.filter(item => item.user_id !== 0);
        console.log(`Removed ${originalCount - cleanedData.length} ratings with user_id = 0`);
    } else {
        cleanedData = data.filter(item => {
            const hasValidUserId = item.user_id !== 0;
            const hasValidReviewId = item.review_id !== '0' && item.review_id !== undefined;
            return hasValidUserId && hasValidReviewId;
        });
        console.log(`Removed ${originalCount - cleanedData.length} sentiment reviews with invalid IDs`);
    }

    return cleanedData;
}