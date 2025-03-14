import * as fs from "fs";

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
