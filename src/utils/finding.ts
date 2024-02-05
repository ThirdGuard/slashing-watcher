// import { EntityType, Label } from "./label"
// import { assertIsFromEnum, assertIsNonEmptyString } from "./utils"

export enum FindingSeverity {
    Unknown,
    Info,
    Low,
    Medium,
    High,
    Critical
}
const pgSeverity: any = {
    5: "CRITICAL",
    4: "HIGH",
    3: "MEDIUM",
    2: "INFO",
    1: "LOW",
    0: "UNKNOWN"
}

export enum FindingType {
    Unknown,
    Exploit,
    Suspicious,
    Degraded,
    Info,
    Scam
}

type FindingSourceChain = {
    chainId: number
}

type FindingSourceBlock = {
    chainId: number
    hash: string
    number: number
}

type FindingSourceTransaction = {
    chainId: number
    hash: string
}

type FindingSourceUrls = {
    url: string
}

type FindingSourceAlerts = {
    id: string
}

type FindingSourceCustom = {
    name: string
    value: string
}

type FindingSource = {
    chains?: FindingSourceChain[]
    blocks?: FindingSourceBlock[]
    transactions?: FindingSourceTransaction[]
    urls?: FindingSourceUrls[]
    alerts?: FindingSourceAlerts[]
    customSources?: FindingSourceCustom[]
}

type FindingInput = {
    name: string,
    description: string,
    alertId: string,
    protocol?: string,
    severity: FindingSeverity,
    type: FindingType,
    metadata?: { [key: string]: string },
    addresses?: string[],
    labels?: any[],
    uniqueKey?: string,
    source?: FindingSource
    timestamp?: Date
}

export class Finding {
    private constructor(
        readonly name: string,
        readonly description: string,
        readonly alertId: string,
        readonly protocol: string,
        readonly severity: FindingSeverity,
        readonly type: FindingType,
        readonly metadata: { [key: string]: string },
        readonly addresses: string[],
        readonly labels: any[],
        readonly uniqueKey: string,
        readonly source: FindingSource,
        readonly timestamp: Date
    ) { }

    toString() {
        return JSON.stringify({
            ...this,
            severity: pgSeverity[this.severity],
            type: FindingType[this.type],
            // labels: this.labels.map(l => Object.assign(l, {
            //     entityType: any[l.entityType]
            // }))
        }, null, 2)
    }

    static from(findingInput: FindingInput) {
        return this.fromObject(findingInput)
    }

    static fromObject({
        name,
        description,
        alertId,
        protocol = 'ethereum',
        severity,
        type,
        timestamp = new Date(Math.floor(Date.now() / 1000) * 1000),
        metadata = {},
        addresses = [],
        labels = [],
        uniqueKey = '',
        source = {},
    }: FindingInput) {
        // assertIsNonEmptyString(name, 'name')
        // assertIsNonEmptyString(description, 'description')
        // assertIsNonEmptyString(alertId, 'alertId')
        // assertIsNonEmptyString(protocol, 'protocol')
        // assertIsFromEnum(severity, FindingSeverity, 'severity')
        // assertIsFromEnum(type, FindingType, 'type')
        // TODO assert metadata keys and values are strings

        return new Finding(name, description, alertId, protocol, pgSeverity[severity], type, metadata, addresses, labels, uniqueKey, source, timestamp)
    }
}