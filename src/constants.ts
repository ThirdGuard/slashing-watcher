export const SECONDS_PER_SLOT = 12
export const SLOTS_PER_EPOCH = 32
export const FILE_CACHE_TIME = 1000 * 60 * 30; // 30 min in milliseconds
export const NODE_OPERATORS_REGISTRY_ADDRESS = "0x55032650b14df07b85bf18a3a3ec8e0af2e028d5";
export const WEBHOOK_URL = (process.env['WEBHOOK_URL'] || 'http://localhost:5001/hook/ethereum');
export const RPC_URL = (process.env['RPC_URL']);

export const CONSENSUS_CLIENT_URI = (process.env['CONSENSUS_CLIENT_URI'] || 'https://docs-demo.quiknode.pro').split(',');

export const NETWORK_NAME = process.env['NETWORK_NAME'] || 'mainnet';

// export const SLOTS_RANGE = process.env['SLOTS_RANGE'] || '7858465-7858467';
// export const SLOTS_RANGE = process.env['SLOTS_RANGE'] || '6142319-6142321'; // random proposer slashing
// export const SLOTS_RANGE = process.env['SLOTS_RANGE'] || '6213851-6213858'; //rockLogic attester slashings
// export const SLOTS_RANGE = process.env['SLOTS_RANGE'] || '8216219-8216221'; //random attester 2 in 1 block
export const SLOTS_RANGE = process.env['SLOTS_RANGE'] || '';

export const CYCLE_SLEEP_IN_SECONDS = parseInt(process.env['CYCLE_SLEEP_IN_SECONDS'] || '2');
