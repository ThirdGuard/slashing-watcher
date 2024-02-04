import { FindingSeverity, FindingType } from '../utils/finding';

declare type FindingInput = {
    name: string;
    description: string;
    alertId: string;
    protocol?: string;
    severity: FindingSeverity;
    type: FindingType;
    metadata?: {
        [key: string]: string;
    };
    addresses?: string[];
    labels?: any[];
};

export type AlertTypee = {
    alertId: string;
    severity: FindingSeverity;
}

export type AlertType = {
    interval: number;
    alert_id: string;
    severity: number;
}

export interface AlertRecord extends AlertType {
    // client_uuid: string;
}

export class AlertManager {
    lastAlerted: number;
    systemLastAlerted: number;
    interval: number;
    alertId: string;
    // severity: string;
    cache: any = {}

    constructor(record: AlertRecord) {
        this.lastAlerted = 0; //@todo get real value from database
        this.interval = record.interval;
        this.systemLastAlerted = Math.floor(new Date().getTime() / 1000);
        this.alertId = record.alert_id;
    }

    //checks time since last alert vs time threshold to alert
    // shouldAlert(now: number = Math.floor(new Date().getTime() / 1000)): boolean {
    shouldAlert(now: number): boolean {
        const timeElapsed = now - this.lastAlerted
        const systemElapsed = Math.floor(new Date().getTime() / 1000) - this.systemLastAlerted
        console.log("systemElapsed", systemElapsed)
        console.log("timeElapsed-block.timestamp", timeElapsed)
        return timeElapsed > this.interval ? true : false
    }

    sendAlert(now: number, finding: FindingInput, cache?: Object) {
        this.lastAlerted = now;
        this.systemLastAlerted = Math.floor(new Date().getTime() / 1000)
        if (cache) {
            this.cache = cache;
        }
        return finding
    }

    updateCache(cache: any) {
        this.cache = cache;
    }
}
export class ThresholdAlertManager {
    criticalThreshold: { count: number, limit: number, timePeriod: number, firstCountTime: number };

    constructor(threshold: { limit: number, timePeriod: number }) {
        this.criticalThreshold = { count: 0, firstCountTime: 0, ...threshold };
        if (this.criticalThreshold.limit <= 0 || this.criticalThreshold.timePeriod <= 0) {
            throw new Error('criticalThreshold must be higher than zero')
        }
    }

    // adjust the count based on how many shouldAlert calls are made
    shouldAlert(now: number, increaseCounter: number = 1): boolean {
        // set the timePeriod counter if it doesnt exist already
        this.criticalThreshold.firstCountTime = this.criticalThreshold.firstCountTime || now;
        this.criticalThreshold.count = this.criticalThreshold.count + increaseCounter;
        let elapsedPeriod = now - this.criticalThreshold.firstCountTime;
        // console.log("elapsedPeriod", elapsedPeriod)
        // console.log("count", this.criticalThreshold.count)
        //reset the firstCountTime if it has elapsed
        if (this.criticalThreshold.timePeriod < elapsedPeriod) {
            this.criticalThreshold.firstCountTime = now;
            this.criticalThreshold.count = 0;
        }
        // if enough count's seen & within the specific timePeriod then we should alert
        if (this.criticalThreshold.count > this.criticalThreshold.limit &&
            this.criticalThreshold.timePeriod > elapsedPeriod) {
            return true
        }
        return false
    }

    sendAlert(now: number, finding: FindingInput) {
        // if the count is higher than the limit, reset the counter
        // if the timePeriod has elapsed, reset the firstCountTime
        if (this.criticalThreshold.count > this.criticalThreshold.limit &&
            this.criticalThreshold.timePeriod > now - this.criticalThreshold.firstCountTime) {
            this.criticalThreshold.count = 0;
            this.criticalThreshold.firstCountTime = 0;
        }
        return finding
    }

}