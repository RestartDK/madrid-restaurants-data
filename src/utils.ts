import * as fs from "fs";
import * as path from "path";
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { Rating } from "./types";

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
function reassignUserIds(ratings: Rating[]): Rating[] {
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