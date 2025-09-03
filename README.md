# FarmShare: Decentralized Farm Ownership and Yield Sharing

## Overview

FarmShare is a Web3 platform built on the Stacks blockchain using Clarity smart contracts. It allows users to buy fractional ownership shares in real-world farms, tracked transparently on the blockchain. Investors earn proportional dividends from crop yields, while farmers gain access to capital for operations without selling their land outright. This solves key real-world problems in agriculture, such as limited access to funding for small farmers, lack of transparency in profit distribution, and barriers for everyday investors to participate in agricultural economies.

The platform tokenizes farm assets into fungible tokens, enabling seamless trading, governance, and automated yield distribution. By leveraging blockchain, it ensures immutable records of ownership, investments, and payouts, reducing fraud and intermediaries.

### Key Features
- **Fractional Ownership**: Buy shares in farms via tokens.
- **Yield Earnings**: Automatic distribution of profits from harvests.
- **Governance**: Token holders vote on farm decisions (e.g., crop types).
- **Transparency**: All transactions and data feeds are on-chain.
- **Real-World Integration**: Uses oracles for off-chain data like yield reports.

### Real-World Problems Solved
1. **Access to Capital for Farmers**: Small farmers often struggle with loans due to high interest or collateral requirements. FarmShare allows them to raise funds by tokenizing future yields without losing ownership.
2. **Investor Barriers in Agriculture**: Traditional farm investments require large capital and expertise. This platform democratizes access, allowing micro-investments with passive returns.
3. **Supply Chain Opacity**: Blockchain tracking ensures verifiable shares and payouts, building trust and reducing disputes.
4. **Economic Inequality in Rural Areas**: Empowers local communities by connecting global investors to regional farms, potentially increasing sustainability and fair trade.
5. **Climate and Risk Management**: Governance features can prioritize resilient crops, addressing environmental challenges.

## Architecture

FarmShare consists of 6 core smart contracts written in Clarity, deployed on the Stacks blockchain. These contracts interact to handle tokenization, investments, governance, and distributions. The system assumes integration with off-chain oracles (e.g., via trusted feeds) for real-world data like crop yields, as Clarity focuses on on-chain logic.

### Smart Contracts

1. **FarmToken.clar** (SIP-10 Fungible Token Contract)
   - Purpose: Represents fractional shares in a specific farm. Each farm has its own token instance.
   - Key Functions:
     - `mint(tokens u128, recipient principal)`: Mints new tokens for initial farm offering (admin only).
     - `transfer(tokens u128, sender principal, recipient principal)`: Transfers tokens between users.
     - `get-balance(owner principal)`: Returns token balance.
     - `burn(tokens u128, owner principal)`: Burns tokens if needed (e.g., for redemptions).
   - Traits: Implements SIP-10 for compatibility with Stacks wallets and exchanges.

2. **FarmRegistry.clar** (Farm Management Contract)
   - Purpose: Registers and manages farm profiles, including metadata like location, size, and expected yields.
   - Key Functions:
     - `register-farm(farm-id u128, owner principal, details (string-ascii 256))`: Registers a new farm (owner only).
     - `update-farm-details(farm-id u128, new-details (string-ascii 256))`: Updates farm info (governance-approved).
     - `get-farm-details(farm-id u128)`: Retrieves farm metadata.
     - `link-token(farm-id u128, token-contract principal)`: Associates a FarmToken contract with the farm.

3. **InvestmentPool.clar** (Crowdfunding and Escrow Contract)
   - Purpose: Handles initial investments and ongoing funding rounds, escrowing STX (Stacks token) until milestones are met.
   - Key Functions:
     - `invest(farm-id u128, amount u128)`: Users send STX to invest, receiving FarmTokens in return.
     - `release-funds(farm-id u128, amount u128)`: Releases escrowed funds to farm owner upon oracle confirmation (e.g., planting started).
     - `refund(investor principal, farm-id u128)`: Refunds if funding goal not met.
     - `get-pool-balance(farm-id u128)`: Checks current escrowed balance.

4. **YieldDistributor.clar** (Profit Sharing Contract)
   - Purpose: Distributes earnings from crop sales proportionally to token holders, based on oracle-fed yield data.
   - Key Functions:
     - `report-yield(farm-id u128, total-earnings u128)`: Oracle or admin reports earnings (with verification).
     - `claim-dividends(farm-id u128, claimant principal)`: Token holders claim their share of STX dividends.
     - `calculate-share(holder principal, farm-id u128)`: Computes proportional dividends based on token balance.
     - `distribute(farm-id u128)`: Batch distribution trigger (governance-initiated).

5. **Governance.clar** (DAO-Style Voting Contract)
   - Purpose: Allows token holders to vote on farm decisions, ensuring decentralized control.
   - Key Functions:
     - `propose-vote(proposal-id u128, description (string-ascii 512), farm-id u128)`: Submits a proposal (e.g., change crop type).
     - `vote(proposal-id u128, vote bool, voter principal)`: Casts a vote weighted by token balance.
     - `end-vote(proposal-id u128)`: Closes voting and executes if passed.
     - `get-vote-results(proposal-id u128)`: Returns vote tallies.

6. **OracleAdapter.clar** (Data Feed Integration Contract)
   - Purpose: Interfaces with trusted off-chain oracles to input real-world data (e.g., yield amounts, market prices) securely.
   - Key Functions:
     - `submit-data(farm-id u128, data-type (string-ascii 64), value u128)`: Oracle principal submits data.
     - `verify-submission(submitter principal)`: Checks if submitter is authorized.
     - `get-latest-data(farm-id u128, data-type (string-ascii 64))`: Retrieves verified data for other contracts.
     - Note: Relies on multi-sig or trusted principals for security, as native oracles aren't built-in.

## Deployment and Usage

### Prerequisites
- Stacks Wallet (e.g., Hiro Wallet) for interacting with contracts.
- Clarity development tools: Install via `cargo install clarity-repl` or use the Stacks CLI.
- Testnet/STX for testing.

### Deployment Steps
1. Clone the repository: `git clone https://github.com/yourusername/farmshare.git`
2. Navigate to `/contracts` and deploy each Clarity file using Stacks CLI:
   - `stacks deploy FarmToken.clar --testnet`
   - Repeat for others, noting contract addresses.
3. Initialize: Call `register-farm` on FarmRegistry with admin privileges.
4. Integrate: Link contracts (e.g., associate FarmToken with a farm).
5. Frontend (Optional): Build a dApp using React/Web3 libraries to interact with these contracts.

### Testing
- Use Clarity REPL for unit tests: Simulate investments, yields, and distributions.
- Example Scenario:
  - Register a farm.
  - Investors buy tokens via InvestmentPool.
  - Oracle reports yield.
  - Holders claim via YieldDistributor.

### Security Considerations
- All contracts use principal checks and non-reentrant patterns.
- Audits recommended before mainnet deployment.
- Oracle data should come from decentralized sources to prevent manipulation.

## Contributing
Fork the repo, create a branch, and submit PRs. Focus on improving Clarity code or adding features like NFT-based unique farm plots.

## License
MIT License. See LICENSE file for details.
