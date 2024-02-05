import { outputFile, readFile, exists } from "fs-extra";
import { join } from "path";
import { FILE_CACHE_TIME } from "../constants";

export async function writeValidatorSlotsToFile(validatorSlots: any) {
    //output to json file
    const DIR = join(process.cwd());
    const filePath = `${DIR}/data/validator-slots.json`;
    console.log('write:', filePath)
    await outputFile(filePath, JSON.stringify(validatorSlots, null, 2));
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

        // Check if an hour has passed since the last read
        if (currentTime - this.cache.lastReadTime < FILE_CACHE_TIME) {
            return this.cache.data; // Return cached data if less than an hour has passed
        }

        // Define the path to the JSON file
        const jsonFilePath = join(process.cwd(), '/data/validator-slots.json');
        console.log("read:", jsonFilePath)

        try {
            if (!await exists(jsonFilePath)) {
                return {}
            }
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

