import * as fs from "fs";
import path from "path";

/*
 * Helper functions for handling CSVs in JS 
 */

function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			// Handle escaped quotes
			if (i < line.length - 1 && line[i + 1] === '"') {
				current += '"';
				i++; // Skip the next quote
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			// End of field
			result.push(current);
			current = "";
		} else {
			current += char;
		}
	}

	// Add the last field
	result.push(current);

	return result;
}

export function readFromCSV<T>(filename: string): T[] {
	if (!fs.existsSync(filename)) {
		console.log(`File not found: ${filename}`);
		return [];
	}

	const csvData = fs.readFileSync(filename, "utf-8");
	const lines = csvData.split("\n");

	if (lines.length < 2) {
		console.log(`No data found in ${filename}`);
		return [];
	}

	// Parse header row to get property names
	const headers = lines[0].split(",");

	// Parse data rows
	const data: T[] = [];
	for (let i = 1; i < lines.length; i++) {
		if (!lines[i].trim()) continue; // Skip empty lines

		const values = parseCSVLine(lines[i]);
		if (values.length !== headers.length) {
			console.warn(
				`Line ${i} has incorrect number of values: ${values.length} (expected ${headers.length})`
			);
			continue;
		}

		const obj = {} as any;
		headers.forEach((header, index) => {
			// Try to convert numeric values
			const value = values[index];
			if (value === "null" || value === "undefined") {
				obj[header] = null;
			} else if (!isNaN(Number(value)) && value !== "") {
				obj[header] = Number(value);
			} else {
				// Remove quotes if present
				if (value.startsWith('"') && value.endsWith('"')) {
					obj[header] = value.slice(1, -1).replace(/""/g, '"');
				} else {
					obj[header] = value;
				}
			}
		});

		data.push(obj as T);
	}

	return data;
}

// Function to write data to CSV
export function writeToCSV<T extends Record<string, any>>(
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


/*
 * Helper functions for converting google maps objects to custom types
 */