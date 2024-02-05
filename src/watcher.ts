// import { ChainReorgEvent, BlockHeaderResponseData, FullBlockInfo } from './consensus/consensus';
import { WatcherHandler } from './handlers/handler';
import { CONSENSUS_CLIENT_URI, CYCLE_SLEEP_IN_SECONDS, SECONDS_PER_SLOT } from './constants';
import { ConsensusClient } from './consensus/consensus';
import { BlockCacheService } from './consensus/block-cache';
import { ValidatorSlots, parseValidators, writeValidatorSlotsToFile } from './utils/validator-slots';

import { ethers } from 'ethers';

const KEEP_MAX_HANDLED_HEADERS_COUNT = 96;

type ChainReorgEvent = any;
type FullBlockInfo = any;


export class Watcher {
    private consensus: ConsensusClient;
    // private alertmanager: AlertmanagerClient;
    // private genesisTime: number;
    private handlers: WatcherHandler[];
    // private chainReorgEventListener: NodeJS.Timeout | null;
    public validatorSlots: ValidatorSlots = new ValidatorSlots();
    // private chainReorgs: Map<string, ChainReorgEvent>;
    // private handledHeaders: BlockHeaderResponseData[];
    private handledHeaders: any[];
    public provider: ethers.providers.JsonRpcProvider;
    public genesisTime!: number;

    constructor(handlers: WatcherHandler[], provider: ethers.providers.JsonRpcProvider) {
        this.provider = provider;
        // this.execution = web3;
        this.consensus = new ConsensusClient(CONSENSUS_CLIENT_URI, new BlockCacheService());
        // this.alertmanager = new AlertmanagerClient(ALERTMANAGER_URI);
        this.handlers = handlers;
        // this.chainReorgEventListener = null;
        // this.chainReorgs = new Map();
        // this.genesisTime = -1;
        this.handledHeaders = [];
    }

    public async run(slotsRange: string = "") {
        console.log('initialised slotsRange:', slotsRange)
        this.genesisTime = await this.consensus.getGenesis();
        const _run = async (slotToHandle: string = 'head') => {
            const currentHead = await this.getHeaderFullInfo(slotToHandle);
            if (!currentHead) {
                // console.debug(`No new head, waiting ${CYCLE_SLEEP_IN_SECONDS} seconds`);
                await new Promise(resolve => setTimeout(resolve, CYCLE_SLEEP_IN_SECONDS * 1000));
                return;
            }
            console.info(`New head [${currentHead.header.message.slot}]`);

            // Handling the current head
            await this.handleHead(currentHead);

            // SLOT_NUMBER = currentHead.header.message.slot;
            // console.log(currentHead);
            await new Promise(resolve => setTimeout(resolve, CYCLE_SLEEP_IN_SECONDS * 1000));
        };

        console.info(`Watcher started. Handlers: ${this.handlers.map(handler => handler.constructor.name).join(', ')}`);

        if (slotsRange) {
            const [start, end] = slotsRange.split('-').map(Number);
            console.log('Watching block range:', start, end)
            for (let slot = start; slot <= end; slot++) {
                try {
                    await _run(slot.toString());
                } catch (e: any) {
                    // if (e instanceof NotOkResponse && e.status === 404) {
                    if (e && e.status === 404) {
                        // Handle 404 error
                        console.error(`404 Error while handling slot ${slot}: ${e.message}`);
                    } else {
                        console.error(`Error while handling slot ${slot}: ${e.message}`);
                    }
                }
            }
        } else {
            console.log('Watching latest blocks')
            while (true) {
                try {
                    //@todo
                    // if (this.chainReorgEventListener === null || !this.chainReorgEventListener.isAlive()) {
                    //     this.chainReorgEventListener = this.listenChainReorgEvent();
                    // }
                    await _run();
                } catch (e: any) {
                    console.error(`Error while handling head: ${e.message}`);
                    await new Promise(resolve => setTimeout(resolve, CYCLE_SLEEP_IN_SECONDS * 1000));
                }
            }
        }
    }

    getSlotTimestamp(slot: number) {
        return this.genesisTime + (SECONDS_PER_SLOT * slot);
    }

    private async handleHead(head: FullBlockInfo): Promise<void> {
        // Assuming that each handler's handle method returns a Promise
        const tasks = this.handlers.map(handler => handler.handle(this, head));

        // Wait for all tasks to complete
        await Promise.all(tasks);

        this.handledHeaders.push(head);
        if (this.handledHeaders.length > KEEP_MAX_HANDLED_HEADERS_COUNT) {
            this.handledHeaders.shift(); // Removes the first element instead of the last one
        }
    }

    public async indexValidators(): Promise<void> {
        // Calculate the current slot based on the current time and genesis time
        const now = Date.now() / 1000; // Date.now() returns milliseconds, so divide by 1000 to get seconds
        const diff = now - await this.consensus.getGenesis();
        // console.log(diff)
        const slot = Math.floor(diff / SECONDS_PER_SLOT);
        // console.log("slot", slot)

        const indexedValidatorsKeys = (await this.validatorSlots.getValidatorSlots() as Record<string, string>);

        console.info('Updating indexed validators keys');

        try {
            // Assuming getValidatorsStream is an asynchronous method returning a Promise
            const data = await this.consensus.getValidatorsState('head');
            console.log("Received validator keys")

            // // Assuming parseValidators is a method that processes the data and updates indexedValidatorsKeys
            const newValidatorsKeys = parseValidators(data, indexedValidatorsKeys);

            console.info(`Indexed validators keys updated`);
            // VALIDATORS_INDEX_SLOT_NUMBER.set(slot); // Assuming VALIDATORS_INDEX_SLOT_NUMBER is a global or static variable
            await writeValidatorSlotsToFile(newValidatorsKeys)
        } catch (e: any) {
            console.error(`Error while getting validators: ${e.message}`);
        }
    }


    private async getHeaderFullInfo(slot: string = 'head'): Promise<FullBlockInfo | null> {
        try {

            const currentHead = await this.consensus.getBlockHeader(slot);

            if (currentHead) {
                if (this.handledHeaders.length > 0 && currentHead.header.message.slot === this.handledHeaders[this.handledHeaders.length - 1].header.message.slot) {
                    return null;
                }

                const currentBlock = await this.consensus.getBlockInfo(currentHead.root);

                //@todo
                // return new FullBlockInfo({ ...currentHead, ...currentBlock });
                return { ...currentHead, ...currentBlock };
            }
        } catch (error) {
            // Handle or log error as needed
            console.error(error);
            return null;
        }
    }
}
