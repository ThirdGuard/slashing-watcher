export const SECONDS_PER_SLOT = 12
export const SLOTS_PER_EPOCH = 32
export const CONSENSUS_CLIENT_URI = (process.env['CONSENSUS_CLIENT_URI'] || 'https://docs-demo.quiknode.pro').split(',');

export const NETWORK_NAME = process.env['NETWORK_NAME'] || 'mainnet';

export const SLOTS_RANGE = process.env['SLOTS_RANGE'] || '6142319-6142321';
export const CYCLE_SLEEP_IN_SECONDS = parseInt(process.env['CYCLE_SLEEP_IN_SECONDS'] || '2');
