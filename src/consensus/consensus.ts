import { HTTPError, Response, got } from 'got-cjs';


import { range } from '../utils/utils';
import { rejectDelay } from '../utils/utils';
import { retrier } from '../utils/utils';
import { urljoin } from '../utils/urljoin';

import { BlockCache, BlockCacheService } from './block-cache';
import { MaxDeepError, ResponseError, errCommon, errRequest } from './errors';
import {
    BlockHeaderResponse,
    BlockInfoResponse,
    FinalityCheckpointsResponse,
    GenesisResponse,
    ProposerDutyInfo,
    SyncCommitteeInfo,
    VersionResponse,
} from './interface';
import { BlockId, Epoch, Slot, StateId } from './consensus.types';

interface RequestRetryOptions {
    maxRetries?: number;
    dataOnly?: boolean;
    useFallbackOnRejected?: (last_error: any, current_error: any) => boolean;
    useFallbackOnResolved?: (r: any) => boolean;
}

const FETCH_INTERVAL_SLOTS = 32;
const CL_API_GET_BLOCK_INFO_MAX_RETRIES = 1;
const CL_API_GET_RESPONSE_TIMEOUT = 15000;
const CHAIN_SLOT_TIME_SECONDS = 12;
const CL_API_MAX_RETRIES = 1;
const CL_API_RETRY_DELAY_MS = 500;

const REQUEST_TIMEOUT_POLICY_MS = {
    // Starts when a socket is assigned.
    // Ends when the hostname has been resolved.
    lookup: undefined,
    // Starts when lookup completes.
    // Ends when the socket is fully connected.
    // If lookup does not apply to the request, this event starts when the socket is assigned and ends when the socket is connected.
    connect: 1000,
    // Starts when connect completes.
    // Ends when the handshake process completes.
    secureConnect: undefined,
    // Starts when the socket is connected.
    // Resets when new data is transferred.
    socket: undefined,
    // Starts when the socket is connected.
    // Ends when all data have been written to the socket.
    send: undefined,
    // Starts when request has been flushed.
    // Ends when the headers are received.
    // Will be redefined by `CL_API_GET_RESPONSE_TIMEOUT`
    response: 1000,
};

export class ConsensusClient {
    protected version = '';
    protected genesisTime = 0;
    protected defaultMaxSlotDeepCount = 32;
    protected latestSlot = { slot: 0, fetchTime: 0 };

    protected endpoints = {
        version: 'eth/v1/node/version',
        genesis: 'eth/v1/beacon/genesis',
        beaconHeadFinalityCheckpoints: 'eth/v1/beacon/states/head/finality_checkpoints',
        blockInfo: (blockId: BlockId): string => `eth/v2/beacon/blocks/${blockId}`,
        beaconHeaders: (blockId: BlockId): string => `eth/v1/beacon/headers/${blockId}`,
        validatorsState: (stateId: StateId): string => `eth/v1/beacon/states/${stateId}/validators`,
        attestationCommittees: (stateId: StateId, epoch: Epoch): string => `eth/v1/beacon/states/${stateId}/committees?epoch=${epoch}`,
        syncCommittee: (stateId: StateId, epoch: Epoch): string => `eth/v1/beacon/states/${stateId}/sync_committees?epoch=${epoch}`,
        proposerDutes: (epoch: Epoch): string => `eth/v1/validator/duties/proposer/${epoch}`,
        attesterDuties: (epoch: Epoch): string => `eth/v1/validator/duties/attester/${epoch}`,
        syncCommitteeDuties: (epoch: Epoch): string => `eth/v1/validator/duties/sync/${epoch}`,
    };

    public constructor(
        protected readonly apiUrls: string[],
        protected readonly cache: BlockCacheService,
    ) { }


    public async getGenesis(): Promise<number> {
        if (this.genesisTime > 0) {
            return this.genesisTime;
        }

        const genesisTime = Number(
            (await this.retryRequest<GenesisResponse>(async (apiURL: string) => this.apiGet(apiURL, this.endpoints.genesis))).genesis_time,
        );
        console.log(`Got genesis time [${genesisTime}] from Consensus Layer Client API`);
        return (this.genesisTime = genesisTime);
    }
    public async getBlockHeader(blockId: BlockId, ignoreCache = false): Promise<BlockHeaderResponse | void> {
        const cached: BlockCache = this.cache.get(String(blockId));
        if (!ignoreCache && cached && (cached.missed || cached.header)) {
            console.debug(`Get ${blockId} header from blocks cache`);
            return cached.missed ? undefined : cached.header;
        }

        const blockHeader = await this.retryRequest<BlockHeaderResponse>(
            async (apiURL: string) => this.apiGet(apiURL, this.endpoints.beaconHeaders(blockId)),
            {
                maxRetries: CL_API_GET_BLOCK_INFO_MAX_RETRIES,
                useFallbackOnRejected: (last_fallback_err, curr_fallback_error) => {
                    if (last_fallback_err && last_fallback_err.$httpCode == 404 && curr_fallback_error.$httpCode != 404) {
                        console.debug('Request error from last fallback was 404, but current is not. Will be used previous error');
                        throw last_fallback_err;
                    }
                    return true;
                },
            },
        ).catch((e) => {
            if (404 != e.$httpCode) {
                console.error('Unexpected status code while fetching block header');
                throw e;
            }
        });

        if (!ignoreCache) {
            const cached: BlockCache = this.cache.get(String(blockId));
            this.cache.set(String(blockId), { missed: !blockHeader, header: blockHeader });
        }

        return blockHeader;
    }

    public async getBlockInfo(blockId: BlockId): Promise<BlockInfoResponse | void> {
        const cached: BlockCache = this.cache.get(String(blockId));
        if (cached && (cached.missed || cached.info)) {
            return cached.missed ? undefined : cached.info;
        }

        const blockInfo = await this.retryRequest<BlockInfoResponse>(
            async (apiURL: string) => this.apiGet(apiURL, this.endpoints.blockInfo(blockId)),
            {
                maxRetries: CL_API_GET_BLOCK_INFO_MAX_RETRIES,
                useFallbackOnRejected: (last_fallback_err, curr_fallback_error) => {
                    if (last_fallback_err && last_fallback_err.$httpCode == 404 && curr_fallback_error.$httpCode != 404) {
                        console.debug('Request error from last fallback was 404, but current is not. Will be used previous error');
                        throw last_fallback_err;
                    }
                    return true;
                },
            },
        ).catch((e) => {
            if (404 != e.$httpCode) {
                console.error('Unexpected status code while fetching block info');
                throw e;
            }
        });

        this.cache.set(String(blockId), { missed: !blockInfo, info: blockInfo });

        return blockInfo;
    }

    protected async retryRequest<T>(callback: (apiURL: string) => Promise<any>, options?: RequestRetryOptions): Promise<T> {
        options = {
            maxRetries: options?.maxRetries ?? CL_API_MAX_RETRIES,
            dataOnly: options?.dataOnly ?? true,
            useFallbackOnRejected: options?.useFallbackOnRejected ?? (() => true), //  use fallback on error as default
            useFallbackOnResolved: options?.useFallbackOnResolved ?? (() => false), // do NOT use fallback on success as default
        };
        const retry = retrier(console, options.maxRetries, 100, 10000, true);
        let res;
        let err: any;
        for (let i = 0; i < this.apiUrls.length; i++) {
            if (res) break;
            res = await callback(this.apiUrls[i])
                .catch(rejectDelay(CL_API_RETRY_DELAY_MS))
                .catch(() => retry(() => callback(this.apiUrls[i])))
                .then((r: any) => {
                    if (options && options.useFallbackOnResolved && options.useFallbackOnResolved(r)) {
                        err = Error('Unresolved data on a successful CL API response');
                        return undefined;
                    }
                    return r;
                })
                .catch((current_error: any) => {
                    if (options && options.useFallbackOnRejected && options.useFallbackOnRejected(err, current_error)) {
                        err = current_error;
                        return undefined;
                    }
                    throw current_error;
                });
            if (i == this.apiUrls.length - 1 && !res) {
                err.message = `Error while doing CL API request on all passed URLs. ${err.message}`;
                throw err;
            }
            if (!res) {
                console.warn(`${err.message}. Error while doing CL API request. Will try to switch to another API URL`);
            }
        }

        if (options.dataOnly) return res.data;
        else return res;
    }

    protected async apiGet<T>(apiURL: string, subUrl: string): Promise<T> {
        const res = await got
            .get(urljoin(apiURL, subUrl), { timeout: { ...REQUEST_TIMEOUT_POLICY_MS, response: CL_API_GET_RESPONSE_TIMEOUT } })
            .catch((e) => {
                if (e.response) {
                    throw new ResponseError(errRequest(e.response.body, subUrl, apiURL), e.response.statusCode);
                }
                throw new ResponseError(errCommon(e.message, subUrl, apiURL));
            });
        if (res.statusCode !== 200) {
            throw new ResponseError(errRequest(res.body, subUrl, apiURL), res.statusCode);
        }
        try {
            return JSON.parse(res.body);
        } catch (e) {
            throw new ResponseError(`Error converting response body to JSON. Body: ${res.body}`);
        }
    }
