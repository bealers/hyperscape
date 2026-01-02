# Hyperscape Roadmap

Hyperscape is an AI-powered, crypto-native, Runescape-inspired MMO built in the browser with Three.js and WebGPU. This roadmap outlines our path from playable prototype to fully decentralized metaverse engine.

## Phase I: Foundation & Polish

**Goal:** A stable, playable, fun MMO prototype with all core systems operational

### Core Game Systems

#### Resource Gathering
- **Woodcutting** — Chop trees to gather wood resources with proper animations, tool requirements, and skill checks
- **Fishing** — Fish at water nodes to gather food with fishing equipment, bait systems, and catch variety

#### Economy & Inventory
- **Banking** — Secure storage for items with deposit/withdrawal and organized inventory management
- **Trading** — Player-to-player direct trading with secure trade windows and confirmation flows
- **Buying/Selling** — NPC shops and player marketplaces for item exchange
- **Basic Crafting** — Combine gathered resources into usable items (tools, food, equipment)

#### Combat & Interaction
- **Combat System** — Attack mechanics, damage calculation, hit/miss rolls, combat animations
- **Item Wielding** — Equip weapons and armor with stat effects and visual representation
- **Item Pickup** — Loot dropped items from the world and defeated enemies
- **Death & Respawning** — Death consequences, respawn points, item drop mechanics

#### Progression
- **Experience System** — Gain XP from all activities (combat, skilling, quests)
- **Skill Leveling** — Runescape-style skill progression with level requirements unlocking new content
- **Tile-Based Movement** — Grid-based pathfinding and movement with click-to-move controls

### PVP & Competition
- **Dueling System** — Challenge players to 1v1 combat with wagering
- **Prediction Markets** — Bet on duel outcomes
- **Competitive League** — Ongoing ranked dueling season with ELO/matchmaking
- **Leaderboards** — Track top players across skills, combat, wealth
- **Rewards** — Seasonal rewards for top performers

### Quest System & Asset Forge
- **Quest Engine** — Traditional dialogue trees and objective tracking
- **AI Quest Generation** — Pre-generate quests via LLM to rapidly populate content
- **Quest NPCs** — Characters that deliver, track, and reward quest completion
- **Procedural Quest Pipeline** — Tooling to generate and validate quests at scale
- **Asset Forge Integration** — Quests tied to generated items, enemies, and locations

### Security & Fairness
- **Server Authority** — All game state validated server-side; client is display-only
- **Anti-Cheat** — Detection for speed hacks, item duplication, automation
- **Rate Limiting** — Prevent action spam and resource exploitation
- **Secure Trading** — Escrow-style trades to prevent scams
- **Audit Logging** — Track suspicious activity for review

### Optimization & Rendering
- **WebGPU Pipeline** — Leverage modern GPU APIs for performance
- **Level of Detail (LOD)** — Distance-based model simplification
- **Occlusion Culling** — Don't render what players can't see
- **Instanced Rendering** — Efficient rendering of repeated objects (trees, NPCs)
- **Network Optimization** — Delta compression, client prediction, lag compensation

### Art Direction & Content
- **Visual Style Guide** — Cohesive aesthetic across all assets
- **World Building** — Consistent lore, geography, and faction design
- **Asset Pipeline** — Standardized process for creating and importing 3D models
- **UI/UX Polish** — Clean, intuitive interface matching the game's aesthetic
- **Audio Design** — Music, ambient sounds, and effect audio

### Deliverables
- All core systems functional and integrated
- 30+ minutes of engaging gameplay loop
- Stable multiplayer with 50+ concurrent players
- Public playtest and feedback incorporation

---

## Phase II: On-Chain & Crypto

**Goal:** Fully decentralized, permissionless game with crypto-native economy

### Blockchain Infrastructure
- **Jeju Deployment** — Deploy game contracts to Jeju network
- **Off-Chain Compute** — Game logic runs off-chain with on-chain settlement
- **State Anchoring** — Periodic commits of game state to chain
- **Verifiable Randomness** — Fair RNG for drops, combat, and gambling via on-chain oracles

### Token Economy

#### GP Token (In-Game Currency)
- **ERC20 Standard** — Fungible in-game gold as a token
- **Earning Mechanisms** — Drops, quest rewards, trading profits
- **Sinks** — NPC shops, crafting fees, death penalties, cosmetics
- **Liquidity** — DEX pools for GP trading

#### HSX Token (Governance & Funding)
- **ICO Launch** — Initial coin offering to fund development
- **Deep Funding Model** — Track all contributor work; retroactive rewards
- **Governance** — HSX holders vote on game direction and treasury allocation
- **Staking** — Stake HSX for rewards and governance weight

### Monetization & Sustainability
- **Gold Sales (X402)** — Purchase GP with fiat/crypto via X402 payment rails
- **Premium Items** — Cosmetics and convenience items for sale
- **Trading Fees** — Small fee on player-to-player trades
- **Application Fee Capture** — Jeju's fee model returns fees to the application
- **Buyback Program** — Revenue used to buy back and burn HSX

### NFT Integration
- **Items as NFTs** — All equipment, materials, and collectibles are NFTs
- **True Ownership** — Players own their items; tradeable on any marketplace
- **Provenance** — Item history tracked on-chain (who crafted it, notable kills, etc.)
- **Interoperability** — Standard formats for potential cross-game use

### Permissionless Architecture
- **Open APIs** — Anyone can build tools, bots (within rules), and interfaces
- **Trustless Trading** — Smart contract escrow for all trades
- **Decentralized Hosting** — Game client served via IPFS/Arweave
- **Community Moderation** — Token-weighted or reputation-based moderation

### Deliverables
- GP and HSX tokens deployed and audited
- Successful HSX ICO
- All items minted as NFTs
- Trading with on-chain settlement
- Fee collection and buyback system operational
- Deep funding distribution system active
- Full mainnet deployment

---

## Phase III: Metaverse Engine

**Goal:** Hyperscape becomes a platform—anyone can create, deploy, and connect worlds

### World Creation Tools
- **World Editor** — Visual tools to design terrain, place objects, define zones
- **AI World Generation** — Procedurally generate entire worlds from prompts
- **Asset Marketplace** — Buy/sell/share custom models, quests, and scripts
- **Template Worlds** — Pre-built starting points (fantasy, sci-fi, modern, etc.)

### Manifest System
- **World Manifests** — JSON/config files defining entire game worlds
- **Hot Loading** — Switch between worlds without client updates
- **Version Control** — Track and rollback world changes
- **Forking** — Clone and modify existing public worlds

### World Linking & Portals
- **Inter-World Travel** — Portals connecting different deployments
- **Shared Identity** — Single player account across all connected worlds
- **Cross-World Economy** — GP and items transferable between compatible worlds
- **World Graph** — Discovery and navigation of the metaverse

### Decentralized Hosting
- **Self-Hosting** — Anyone can run a world server
- **Federated Architecture** — Worlds communicate via standard protocols
- **Distributed State** — World state shared across multiple nodes
- **Censorship Resistance** — No central authority can shut down worlds

### Engine as Platform
- **Hyperscape SDK** — Developer toolkit for building on the engine
- **Plugin System** — Extend engine functionality with custom code
- **Scripting Language** — Safe, sandboxed scripting for custom game logic
- **Documentation & Tutorials** — Comprehensive guides for world creators

### Governance & Curation
- **World Registry** — On-chain registry of all public worlds
- **Quality Standards** — Community-driven standards for featured worlds
- **Dispute Resolution** — Handle cross-world conflicts and scams
- **Protocol Upgrades** — Decentralized process for engine improvements

### Deliverables
- World editor publicly available
- 10+ community-created worlds live
- Portal system connecting worlds
- SDK and documentation complete
- Decentralized world hosting operational
- Metaverse governance framework established

---

## Contributing

We're actively seeking contributors across all disciplines:

| Area | Skills Needed |
|------|---------------|
| Game Systems | TypeScript, game design, Runescape knowledge |
| Rendering | Three.js, WebGPU, shader programming, procedural generation |
| Backend | Node.js, real-time networking, databases |
| Smart Contracts | Solidity, ERC standards, security |
| Art | 3D generation and curation and cleanup |
| AI/ML | ElizaOS and general agent integration |
| DevOps | CI/CD, infrastructure, monitoring |

### How to Get Started
1. Join our Discord and introduce yourself
2. Check the issue tracker for `good-first-issue` tags
3. Read the contributor guide in `/docs/CONTRIBUTING.md`
4. Pick a task, coordinate in Discord, and submit a PR

