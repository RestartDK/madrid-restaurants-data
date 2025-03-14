import * as fs from "fs";
import * as path from "path";
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

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