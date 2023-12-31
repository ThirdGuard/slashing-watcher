import { outputFile, readFile } from "fs-extra";
import { join } from "path";

export async function writeValidatorSlotsToFile(validatorSlots: any) {
    //output to json file
    const DIR = join(process.cwd());
    await outputFile(`${DIR}/src/validator-slots.json`, JSON.stringify(validatorSlots, null, 2));
}

export function parseValidators(data: any, currentIndexes: Record<string, string>): Record<string, string> {
    for (const validator of data.data) {
        const index = validator.index;
        if (currentIndexes[index]) {
            continue;
        }
        currentIndexes[index] = validator.validator.pubkey;
    }
    return currentIndexes;
}

export class ValidatorSlots {
    public cache: {
        lastReadTime: number;
        data?: Record<string, string>;
    } = { lastReadTime: 0 };

    async getValidatorSlots() {
        const currentTime = Date.now();
        const oneHour = 3600000; // One hour in milliseconds

        // Check if an hour has passed since the last read
        if (currentTime - this.cache.lastReadTime < oneHour) {
            return this.cache.data; // Return cached data if less than an hour has passed
        }

        // Define the path to the JSON file
        const jsonFilePath = join(__dirname, '../validator-slots.json');

        try {
            // Read the JSON file asynchronously using fs-extra
            const rawData = await readFile(jsonFilePath, 'utf-8');

            // Parse the JSON data
            const data: Record<string, string> = JSON.parse(rawData);

            // Update cache
            this.cache = {
                lastReadTime: currentTime,
                data
            };
            return this.cache.data;
        } catch (err) {
            // Handle possible errors
            console.error('Error reading file:', err);
            throw err; // Rethrow the error to be handled by the caller
        }
    }
}

