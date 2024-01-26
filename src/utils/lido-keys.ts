import { ethers } from "ethers";
import { join } from 'path';
import { outputFile, readFile } from 'fs-extra';
import { PubKeyData } from "src/handlers/slashing";

export const NODE_OPERATORS_REGISTRY_ADDRESS = "0x55032650b14df07b85bf18a3a3ec8e0af2e028d5";
// export const LIDO_WITHDRAWAL_QUEUE = "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1"

type SigningKeyData = {
    pubkeys: string,
    signatures: string,
    used: boolean[]
}

export type Validator = {
    nodeOperatorId: number,
    pubkeys: string[]
}

export class KeyCollector {
    public cache: {
        lastReadTime: number;
        data?: PubKeyData[];
    } = { lastReadTime: 0 };
    private noregistry: ethers.Contract;

    constructor(noregistry: ethers.Contract) {
        this.noregistry = noregistry
    }

    unpackPubKeys(concatenatedKeys: string) {
        //lido returns all pubkeys concatenated into one huge bytes object, this function unpacks it to return a list of individual keys
        //drop the 0x prefix
        let formatKeys = concatenatedKeys.substring(2)
        const keys: string[] = [];
        for (let i = 0; i < formatKeys.length; i += 96) {
            const key = "0x" + formatKeys.substring(i, i + 96);
            keys.push(key);
        }
        return keys;
    }

    getUsedPubKeys(pubkeys: string[], used: boolean[]): string[] {
        //some pubkeys aren't in use so we need to filter these out
        const usedPubKeys: string[] = [];
        // console.log("total keys:", pubkeys.length)
        pubkeys.forEach((pubkey, index) => {
            if (used[index]) {
                usedPubKeys.push(pubkey);
            }
        });
        // console.log("used keys:", usedPubKeys.length)
        return usedPubKeys;
    }

    async getValidatorKeys(operatorId: number, batchSize: number = 1000) {
        //given an operator (currently 30 of them in Lido) collect all used pubkeys
        const totalKeys = await this.noregistry.getTotalSigningKeyCount(operatorId);
        let offset = 0;
        let remainingKeys = totalKeys.toNumber();
        let allPubkeys: string[] = [];
        let allUsed: boolean[] = [];

        const promises: Promise<SigningKeyData>[] = [];

        while (remainingKeys > 0) {
            const currentBatchSize = Math.min(batchSize, remainingKeys);
            const promise = this.noregistry.getSigningKeys(
                operatorId,
                offset,
                currentBatchSize
            )
            promises.push(promise);
            offset += currentBatchSize;
            remainingKeys -= currentBatchSize;
        }

        const keyDataArray = await Promise.all(promises);
        keyDataArray.forEach((keyData: SigningKeyData) => {
            const keys = this.unpackPubKeys(keyData.pubkeys);
            allPubkeys = allPubkeys.concat(keys);
            allUsed = allUsed.concat(keyData.used);
        });

        const allUsedPubKeys = this.getUsedPubKeys(allPubkeys, allUsed);
        return allUsedPubKeys;
    }

    async getAllValidatorKeys(minChunkSize: number = 1) {
        //iterate through all operators to get their respective pubkeys
        let totalValidators = await this.noregistry.getActiveNodeOperatorsCount()
        const totalValidatorsNumber = totalValidators.toNumber();
        // console.log("totalValidators", totalValidators.toString())
        let validators: Validator[] = []

        let concurrent = [];
        const chunkSize = Math.min(minChunkSize, totalValidatorsNumber);
        for (let i = 0; i < totalValidatorsNumber; i += chunkSize) {
            console.log(i)
            concurrent = []; // Reset the concurrent array for each chunk

            // Create a new chunk by slicing the array of validators
            for (let j = 0; j < chunkSize && i + j < totalValidatorsNumber; j++) {
                concurrent.push(this.getValidatorKeys(i + j));
            }

            const validatorKeys = await Promise.all(concurrent);

            // Create and push new validators for each key
            validatorKeys.forEach((keys, index) => {
                const validator = { nodeOperatorId: i + index, pubkeys: keys };
                validators.push(validator);
            });
        }
        return validators
    }

    async writeKeysToFile(validatorKeys: Validator[]) {
        //output to json file
        const DIR = join(process.cwd());
        const filePath = `${DIR}/dist/lido-validator-keys.json`;
        console.log('write:', filePath)
        await outputFile(filePath, JSON.stringify(validatorKeys, null, 2));
    }

    async getLidoKeys() {
        const currentTime = Date.now();
        const oneHour = 3600000; // One hour in milliseconds

        // Check if an hour has passed since the last read
        if (currentTime - this.cache.lastReadTime < oneHour) {
            return this.cache.data; // Return cached data if less than an hour has passed
        }

        // Define the path to the JSON file
        const jsonFilePath = join(__dirname, '../lido-validator-keys.json');
        console.log("read:", jsonFilePath)

        try {
            // Read the JSON file asynchronously using fs-extra
            const rawData = await readFile(jsonFilePath, 'utf-8');

            // Parse the JSON data
            const keys: PubKeyData[] = JSON.parse(rawData);

            // Update cache
            this.cache = {
                lastReadTime: currentTime,
                data: keys
            };
            return this.cache.data;
        } catch (err) {
            // Handle possible errors
            console.error('Error reading file:', err);
            throw err; // Rethrow the error to be handled by the caller
        }
    }
}