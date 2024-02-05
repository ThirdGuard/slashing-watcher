# Ethereum Consensus Validator Watcher

This open-source project provides a tool to monitor Ethereum consensus validators, specifically focusing on those operated by Lido. It comprises two main components: an indexer and a watcher. These components work together to index validator keys and monitor for attestation or proposer violations, with a particular focus on detecting slashing events among Lido's node operators.

## Overview

- **Indexer (`indexer.ts`)**: Indexes validator keys for Lido and associates validator slots with their public keys. It runs every 30 minutes to ensure the data is up-to-date.
- **Watcher (`watcher.ts`)**: Utilizing the consensus layer RPC, this component watches every new head for attestation or proposer violations. If a violation is detected, it checks against the indexed Lido node operator keys to determine if any Lido operators have been slashed. Slashing events trigger webhook alerts.

## Features

- **Validator Key Indexing**: Keeps a current index of validator keys associated with Lido node operators.
- **Violation Monitoring**: Monitors the Ethereum consensus layer for any attestation or proposer violations that could indicate slashing events.
- **Slashing Alerts**: Sends critical alerts via webhook if 100 validators have been slashed within a 1-hour period, highlighting potential issues with Lido's node operators.

## Setup

To get started with the Ethereum Consensus Validator Watcher, follow these steps:

1. **Clone the Repository**
    ```
    git clone <repository-url>
    ```

2. **Build the Docker Containers**
    ```bash
    docker-compose build
    ```

3. **Run the Docker Containers**
    ```bash
    docker-compose up -d
    ```

    This will start both the indexer and watcher processes in separate containers, sharing a volume for data persistence and communication.

## Configuration

To configure the Ethereum Consensus Validator Watcher for your environment, you may need to adjust the following:

- **Consensus Layer RPC**: Specify the URL of your Ethereum consensus layer RPC endpoint in the Docker Compose file or as an environment variable to the watcher service.
- **Webhook URL**: Set up the destination URL for your webhook alerts in case of detected slashing events.

## Contributing

Contributions to the Ethereum Consensus Validator Watcher are welcome! Whether it's feature requests, bug reports, or code contributions, please feel free to make a pull request or open an issue in the repository.

## License

This project is open-sourced under the MIT License. See the LICENSE file for more details.
