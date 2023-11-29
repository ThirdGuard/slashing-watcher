import { CONSENSUS_CLIENT_URI, CYCLE_SLEEP_IN_SECONDS, SECONDS_PER_SLOT, SLOTS_PER_EPOCH, SLOTS_RANGE } from './constants';
import { ConsensusClient } from './consensus/consensus';
import { BlockCacheService } from './consensus/block-cache';

const KEEP_MAX_HANDLED_HEADERS_COUNT = 96;

type WatcherHandler = any;
type ChainReorgEvent = any;
type NamedKey = any;
type FullBlockInfo = any;
type BaseSource = any;

export class Watcher {
    private consensus: ConsensusClient;
    private handlers: WatcherHandler[];
    private handledHeaders: any[];

    constructor(handlers: WatcherHandler[]) {
        this.consensus = new ConsensusClient(CONSENSUS_CLIENT_URI, new BlockCacheService());
        this.handlers = handlers;
        this.handledHeaders = [];
    }

    public async run(slotsRange: string | undefined = SLOTS_RANGE) {
        // this.genesisTime = await this.consensus.getGenesis();
        const _run = async (slotToHandle: string = 'head') => {
            const currentHead = await this.getHeaderFullInfo(slotToHandle);
            if (!currentHead) {
                console.debug(`No new head, waiting ${CYCLE_SLEEP_IN_SECONDS} seconds`);
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
            for (let slot = start; slot <= end; slot++) {
                try {
                    await _run(slot.toString());
                } catch (e: any) {
                    // if (e instanceof NotOkResponse && e.status === 404) {
                    if (e && e.status === 404) {
                        // Handle 404 error
                    } else {
                        console.error(`Error while handling slot ${slot}: ${e.message}`);
                    }
                }
            }
        } else {
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
