import { outputFile } from "fs-extra";
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
