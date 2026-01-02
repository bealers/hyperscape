# Hyperscape Project Summary

A comprehensive analysis of the Hyperscape MMORPG ecosystem for potential contributors.

## Executive Summary

**Hyperscape** is an AI-powered RuneScape-style MMORPG built on a heavily modified fork of [Hyperfy](https://github.com/hyperfy-xyz/hyperfy), an open-source 3D multiplayer engine. The project combines real-time 3D gameplay with [ElizaOS](https://elizaos.ai) AI agents, allowing autonomous AI players to interact alongside humans in a persistent world.

### Unique Value Proposition

- **AI Agents as Players**: Autonomous agents powered by ElizaOS that fight, skill, trade, and make decisions using LLMs
- **True OSRS Mechanics**: Authentic tick-based combat (600ms ticks), tile-based movement, classic progression
- **Manifest-Driven Content**: Add NPCs, items, and content by editing JSON files - no code required
- **Open Source**: MIT licensed with extensible architecture

### Repository Ecosystem

| Repository | Purpose | Technology |
|------------|---------|------------|
| [HyperscapeAI/hyperscape](https://github.com/HyperscapeAI/hyperscape) | Main game monorepo | TypeScript, Three.js, Fastify |
| [dreaminglucid/3d-asset-forge](https://github.com/dreaminglucid/3d-asset-forge) | AI asset generation | React, GPT-4, Meshy.ai |
| [HyperscapeAI/assets](https://github.com/HyperscapeAI/assets) | Game assets (Git LFS) | GLB, VRM, PNG (~200MB) |

---

## Technical Architecture

### Monorepo Structure

The main repository is a **Turbo-powered monorepo** with 7 packages:

```
packages/
├── shared/              # Core 3D engine (ECS, Three.js, PhysX)
├── server/              # Game server (Fastify, WebSockets, PostgreSQL)
├── client/              # Web client (Vite, React)
├── plugin-hyperscape/   # ElizaOS AI agent plugin
├── physx-js-webidl/     # PhysX WASM bindings
├── asset-forge/         # AI asset generation tools
└── docs-site/           # Docusaurus documentation
```

**Build Order**: `physx-js-webidl` → `shared` → all other packages

### Entity Component System (ECS)

The game uses a clean ECS architecture:

| Layer | Files | Purpose |
|-------|-------|---------|
| **Entities** | 24 files | Game objects (PlayerLocal, MobEntity, ItemEntity) |
| **Systems** | 187 files | Logic processors (CombatSystem, InventorySystem) |
| **Components** | 12 files | Data containers (position, health, inventory) |
| **Types** | 51 files | TypeScript definitions |

### Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| 3D Engine | Three.js | 0.180.0 |
| Physics | PhysX (WASM) | - |
| Avatars | VRM format | 0.x and 1.0 |
| Server | Fastify + WebSockets | - |
| Database | PostgreSQL (prod), SQLite (dev) | 16 |
| AI Agents | ElizaOS | - |
| Auth | Privy | - |
| Build | Turbo + Vite + esbuild | - |

---

## Content Pipeline

### Asset Forge (AI-Powered)

The Asset Forge tool generates game-ready 3D assets from text descriptions:

```
Text Description → GPT-4 Enhancement → DALL-E Concept Art
                                     → Meshy.ai 3D Generation
                                     → Material Variants
                                     → Asset Library
```

**Features**:
- Text-to-3D model generation
- Automatic material variants (bronze, steel, mithril)
- Armor fitting to character models
- AI-powered weapon grip positioning

**Setup**:
```bash
cd packages/asset-forge
cp .env.example .env
# Add OPENAI_API_KEY and MESHY_API_KEY
bun run dev:forge
```

### Manifest-Driven Content

Content is defined in JSON manifests - no code changes required:

| Manifest | Location | Purpose |
|----------|----------|---------|
| `items.json` | `world/assets/manifests/` | Weapons, armour, consumables |
| `npcs.json` | `world/assets/manifests/` | All NPC definitions |
| `resources.json` | `world/assets/manifests/` | Trees, rocks, fishing spots |
| `world-areas.json` | `world/assets/manifests/` | Zones with spawn points |
| `stores.json` | `world/assets/manifests/` | Shop inventories |
| `biomes.json` | `world/assets/manifests/` | Biome definitions |

---

## Customisation Guide

### Adding Custom Characters (VRM Avatars)

**Requirements**:
- VRM format file (VRM 0.x or 1.0)
- Humanoid skeleton with standardised bone names
- Model is automatically normalised to 1.6m height

**Conversion Tools**:
- [VRM Add-on for Blender](https://vrm-addon-for-blender.info/) - Recommended
- [UniVRM](https://github.com/vrm-c/UniVRM) - Unity-based alternative

**Steps**:

1. **Convert your rigged model to VRM**
   - Install VRM Add-on for Blender
   - Import your model
   - Configure humanoid bone mapping
   - Export as VRM

2. **Place in assets directory**
   ```
   packages/server/world/assets/avatars/your-avatar.vrm
   ```

3. **Register in avatars.ts**
   ```typescript
   // packages/shared/src/data/avatars.ts
   export const AVATAR_OPTIONS: AvatarOption[] = [
     // ... existing avatars ...
     {
       id: "your-avatar-id",
       name: "Your Avatar Name",
       url: "asset://avatars/your-avatar.vrm",
       previewUrl: "http://localhost:8080/avatars/your-avatar.vrm",
       description: "Your custom avatar description",
     },
   ];
   ```

4. **Start the CDN and test**
   ```bash
   bun run cdn:up
   bun run dev
   ```

**Technical Notes**:
- VRM 1.0+ models are automatically rotated 180° (face -Z forward)
- MToon materials are converted to MeshStandardMaterial for proper lighting
- Spring bone physics (hair, clothes) is supported

### Adding Custom Buildings

**Format**: GLB/GLTF (Binary or JSON)

**Option A - Static Decoration**:
1. Place GLB in `packages/server/world/assets/models/`
2. Reference in environment configuration

**Option B - Interactive Entity** (bank, shop):
1. Place GLB in `packages/server/world/assets/models/buildings/`

2. Add NPC entry to `world/assets/manifests/npcs.json`:
   ```json
   {
     "id": "custom_banker",
     "name": "Custom Banker",
     "category": "service",
     "services": { "types": ["bank"] },
     "appearance": {
       "modelPath": "asset://models/buildings/custom-bank.glb"
     }
   }
   ```

3. Add spawn point to `world/assets/manifests/world-areas.json`:
   ```json
   {
     "npcs": [
       {
         "id": "custom_banker",
         "type": "bank",
         "position": { "x": 10, "y": 0, "z": 20 }
       }
     ]
   }
   ```

4. Restart server to reload manifests

### Adding Custom Items

Edit `world/assets/manifests/items.json`:
```json
{
  "id": "custom_sword",
  "name": "Custom Sword",
  "type": "weapon",
  "slot": "weapon",
  "stackable": false,
  "tradeable": true,
  "value": 500,
  "attackBonus": 15,
  "strengthBonus": 10,
  "requirements": {
    "attack": 10
  }
}
```

### Adding Custom UI Elements

The client uses React with a layered UI architecture. All game UI is rendered in `CoreUI.tsx` which contains the HUD, sidebars, panels, and overlays.

#### UI Component Structure

```
packages/client/src/
├── game/
│   ├── CoreUI.tsx           # Main UI container (HUD, sidebars, overlays)
│   ├── Sidebar.tsx          # Right sidebar with panel windows
│   ├── hud/                  # HUD elements (StatusBars, XPProgressOrb, etc.)
│   ├── panels/               # Sidebar panels (InventoryPanel, SkillsPanel, etc.)
│   └── chat/                 # Chat system
├── screens/                  # Full-screen views (LoginScreen, CharacterSelectScreen)
└── components/               # Reusable UI components
```

#### Creating a New Panel

1. **Create the panel component** in `packages/client/src/game/panels/`:

```typescript
// packages/client/src/game/panels/WalletLinkPanel.tsx
import React from "react";
import type { ClientWorld } from "../../types";

interface WalletLinkPanelProps {
  world: ClientWorld;
}

export function WalletLinkPanel({ world }: WalletLinkPanelProps) {
  return (
    <div className="h-full overflow-y-auto p-2">
      {/* Panel content */}
    </div>
  );
}
```

2. **Register in Sidebar.tsx** - Add to the window rendering logic:

```typescript
// In Sidebar.tsx, add to openWindows rendering
{openWindows.has("wallet-link") && (
  <GameWindow
    id="wallet-link"
    title="Link Wallets"
    onClose={() => closeWindow("wallet-link")}
    // ... other props
  >
    <WalletLinkPanel world={world} />
  </GameWindow>
)}
```

3. **Add menu button** to trigger the panel.

#### Existing Panel Examples

| Panel | File | Purpose |
|-------|------|---------|
| `AccountPanel.tsx` | `game/panels/` | User info, wallet display, logout |
| `InventoryPanel.tsx` | `game/panels/` | Item management |
| `BankPanel.tsx` | `game/panels/` | RS3-style bank interface |
| `SettingsPanel.tsx` | `game/panels/` | Game settings |

---

## Extending Wallet Features

The current Privy integration handles main authentication, but for verifying ownership of **additional external wallets**, you have two options:

| Approach | When to Use |
|----------|-------------|
| **Privy** | Already connected wallets via Privy's multi-wallet support |
| **Direct (wagmi/viem)** | Any external wallet (MetaMask, Ledger, etc.) - **recommended** |

> **Note**: Privy is NOT required for wallet verification. Any library that can request signatures works. The verification is done by the signature itself, not by Privy.

### Option A: Direct Wallet Connection (Recommended)

Use wagmi + viem for connecting and signing with any wallet. This is more flexible and doesn't depend on Privy.

#### Install Dependencies

```bash
bun add wagmi viem @tanstack/react-query
```

#### Create Wallet Verification Component

```typescript
// packages/client/src/game/panels/WalletLinkPanel.tsx
import React, { useState } from "react";
import { useAccount, useConnect, useSignMessage, useDisconnect } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import type { ClientWorld } from "../../types";

export function WalletLinkPanel({ world }: { world: ClientWorld }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  
  const [linkedWallets, setLinkedWallets] = useState<string[]>([]);
  const [verifying, setVerifying] = useState(false);

  const verifyWalletOwnership = async () => {
    if (!address) return;
    setVerifying(true);
    
    // Create verification message with timestamp to prevent replay attacks
    const message = `Verify wallet ownership for Hyperscape

Wallet: ${address}
Timestamp: ${Date.now()}
Action: Link wallet to account`;
    
    try {
      // Request signature - this prompts the user's wallet
      const signature = await signMessageAsync({ message });
      
      // Send to server for verification
      const response = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          message,
          signature,
        }),
      });
      
      if (response.ok) {
        setLinkedWallets([...linkedWallets, address]);
        disconnect(); // Disconnect after verification
      }
    } catch (error) {
      console.error("Wallet verification failed:", error);
    }
    
    setVerifying(false);
  };

  return (
    <div className="p-2">
      <h3 className="text-sm font-bold mb-2">Link Additional Wallets</h3>
      
      {!isConnected ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Connect a wallet to verify ownership</p>
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => connect({ connector })}
              className="w-full px-3 py-2 bg-amber-600/20 border border-amber-600/40 rounded text-xs"
            >
              Connect {connector.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button
              onClick={verifyWalletOwnership}
              disabled={verifying}
              className="px-2 py-1 bg-green-600 rounded text-xs"
            >
              {verifying ? "Signing..." : "Verify & Link"}
            </button>
            <button
              onClick={() => disconnect()}
              className="px-2 py-1 bg-red-600/50 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {linkedWallets.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-bold mb-1">Linked Wallets</h4>
          {linkedWallets.map((wallet) => (
            <div key={wallet} className="flex items-center gap-2 text-xs">
              <span className="text-green-500">✓</span>
              <span className="font-mono">{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### Wagmi Provider Setup

```typescript
// packages/client/src/lib/wagmi-config.ts
import { createConfig, http } from "wagmi";
import { mainnet, polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon],
  connectors: [
    injected(),
    walletConnect({ projectId: "YOUR_WALLETCONNECT_PROJECT_ID" }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
});
```

```typescript
// Wrap your app with WagmiProvider (in addition to PrivyProvider)
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./lib/wagmi-config";

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <PrivyProvider>
          {/* Your app */}
        </PrivyProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### Option B: Using Privy (If Already Connected)

If the user has already connected multiple wallets through Privy, you can access them via Privy's hooks:

```typescript
import { useWallets } from "@privy-io/react-auth";

function PrivyWalletVerification() {
  const { wallets } = useWallets();
  
  // wallets contains all Privy-connected wallets
  // Use wallet.sign(message) to request signature
}
```

#### Step 2: Server-Side Signature Verification

```typescript
// packages/server/src/startup/routes/wallet-routes.ts
import { recoverMessageAddress } from "viem";

export function registerWalletRoutes(fastify: FastifyInstance) {
  fastify.post("/api/wallet/verify", async (request, reply) => {
    const { address, message, signature } = request.body as {
      address: string;
      message: string;
      signature: string;
    };

    // Recover signer address from signature
    const recoveredAddress = await recoverMessageAddress({
      message,
      signature,
    });

    // Verify signature matches claimed address
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return reply.status(401).send({ error: "Invalid signature" });
    }

    // Store verified wallet link in database
    // ... database logic

    return { success: true, address };
  });
}
```

### Querying NFTs from Verified Wallets

Once wallets are verified, query NFT holdings using blockchain APIs:

#### Using Alchemy NFT API

```typescript
// packages/client/src/services/nft-service.ts
const ALCHEMY_API_KEY = import.meta.env.PUBLIC_ALCHEMY_API_KEY;

export interface NFTMetadata {
  tokenId: string;
  contract: string;
  name: string;
  image: string;
  collection: string;
}

export async function fetchNFTsForWallet(
  walletAddress: string,
  chain: "eth-mainnet" | "polygon-mainnet" = "eth-mainnet"
): Promise<NFTMetadata[]> {
  const response = await fetch(
    `https://${chain}.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner?owner=${walletAddress}&withMetadata=true`
  );
  
  const data = await response.json();
  
  return data.ownedNfts.map((nft: any) => ({
    tokenId: nft.tokenId,
    contract: nft.contract.address,
    name: nft.name || nft.title,
    image: nft.image?.cachedUrl || nft.image?.originalUrl,
    collection: nft.contract.name,
  }));
}
```

#### NFT Gallery Panel

```typescript
// packages/client/src/game/panels/NFTGalleryPanel.tsx
import React, { useEffect, useState } from "react";
import { fetchNFTsForWallet, NFTMetadata } from "../../services/nft-service";

export function NFTGalleryPanel({ walletAddresses }: { walletAddresses: string[] }) {
  const [nfts, setNfts] = useState<NFTMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNFTs() {
      const allNfts: NFTMetadata[] = [];
      for (const address of walletAddresses) {
        const walletNfts = await fetchNFTsForWallet(address);
        allNfts.push(...walletNfts);
      }
      setNfts(allNfts);
      setLoading(false);
    }
    loadNFTs();
  }, [walletAddresses]);

  if (loading) return <div>Loading NFTs...</div>;

  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {nfts.map((nft) => (
        <div key={`${nft.contract}-${nft.tokenId}`} className="rounded border p-1">
          <img src={nft.image} alt={nft.name} className="w-full aspect-square object-cover" />
          <div className="text-xs truncate">{nft.name}</div>
          <div className="text-[10px] text-gray-400">{nft.collection}</div>
        </div>
      ))}
    </div>
  );
}
```

### Database Schema for Linked Wallets

Add to database schema for storing verified wallets:

```typescript
// packages/server/src/database/migrations/schema.ts
export const linkedWallets = pgTable(
  "linked_wallets",
  {
    id: serial().primaryKey().notNull(),
    userId: text().notNull(),          // Privy user ID
    characterId: text(),                // Optional: link to specific character
    walletAddress: text().notNull(),
    chain: text().default("ethereum"),
    verifiedAt: timestamp({ mode: "string" }).defaultNow(),
    signature: text().notNull(),        // Store proof of verification
  },
  (table) => [
    index("idx_linked_wallets_user").using("btree", table.userId),
    unique("linked_wallets_user_address").on(table.userId, table.walletAddress),
  ],
);
```

### Privy Hooks Reference

Key Privy hooks for wallet features:

| Hook | Purpose |
|------|---------|
| `usePrivy()` | Auth state, user info, login/logout |
| `useWallets()` | Access connected wallets |
| `useLinkAccount()` | Link additional auth methods |
| `useCreateWallet()` | Create embedded wallets |

**Documentation**: [Privy React SDK](https://docs.privy.io/guide/react/)

### Privy vs Direct Integration

Privy handles authentication but does NOT provide blockchain data services:

| Feature | Privy | Direct Integration Required |
|---------|-------|----------------------------|
| Wallet auth | ✅ Yes | - |
| Delegated actions | ✅ Yes (Privy's own system) | - |
| Gas sponsorship | ✅ Yes | - |
| ENS resolution | ❌ No | viem/ethers |
| delegate.cash | ❌ No | Direct contract reads |
| NFT queries | ❌ No | Alchemy/Moralis API |

---

## ENS Resolution

Resolve Ethereum addresses to human-readable names and vice versa using viem:

```typescript
// packages/client/src/services/ens-service.ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY"),
});

// Resolve address to ENS name (e.g., 0x123... → "vitalik.eth")
export async function getEnsName(address: `0x${string}`): Promise<string | null> {
  return await publicClient.getEnsName({ address });
}

// Resolve ENS name to address (e.g., "vitalik.eth" → 0x123...)
export async function getEnsAddress(name: string): Promise<`0x${string}` | null> {
  return await publicClient.getEnsAddress({ name });
}

// Get ENS avatar image URL
export async function getEnsAvatar(name: string): Promise<string | null> {
  return await publicClient.getEnsAvatar({ name });
}

// Get ENS text records (twitter, discord, url, description, etc.)
export async function getEnsText(name: string, key: string): Promise<string | null> {
  return await publicClient.getEnsText({ name, key });
}

// Example: Get all profile data
export async function getEnsProfile(address: `0x${string}`) {
  const name = await getEnsName(address);
  if (!name) return null;
  
  const [avatar, twitter, discord, description] = await Promise.all([
    getEnsAvatar(name),
    getEnsText(name, "com.twitter"),
    getEnsText(name, "com.discord"),
    getEnsText(name, "description"),
  ]);
  
  return { name, avatar, twitter, discord, description };
}
```

### Display ENS in UI

```typescript
// Example: Show ENS name instead of address
function PlayerName({ address }: { address: `0x${string}` }) {
  const [ensName, setEnsName] = useState<string | null>(null);
  
  useEffect(() => {
    getEnsName(address).then(setEnsName);
  }, [address]);
  
  return (
    <span className="font-mono">
      {ensName || `${address.slice(0, 6)}...${address.slice(-4)}`}
    </span>
  );
}
```

---

## delegate.cash Integration

[delegate.cash](https://delegate.xyz) (formerly delegate.xyz) allows users to delegate wallet permissions. This is useful for:

- **Vault protection**: Prove NFT ownership without exposing cold storage
- **Hot wallet gaming**: Play with a hot wallet while NFTs stay in vault
- **Team access**: Let team members act on behalf of a treasury

### Query Delegations

```typescript
// packages/client/src/services/delegate-service.ts
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

// delegate.cash Registry V2 (same address on all chains)
const DELEGATE_REGISTRY_V2 = "0x00000000000000447e69651d841bD8D104Bed493" as const;

const delegateAbi = parseAbi([
  "function getIncomingDelegations(address to) view returns (tuple(uint8 type_, address to, address from, bytes32 rights, address contract_, uint256 tokenId)[])",
  "function getOutgoingDelegations(address from) view returns (tuple(uint8 type_, address to, address from, bytes32 rights, address contract_, uint256 tokenId)[])",
  "function checkDelegateForAll(address delegate, address vault) view returns (bool)",
  "function checkDelegateForContract(address delegate, address vault, address contract_) view returns (bool)",
  "function checkDelegateForERC721(address delegate, address vault, address contract_, uint256 tokenId) view returns (bool)",
]);

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Delegation types
export enum DelegationType {
  NONE = 0,
  ALL = 1,        // Full delegation
  CONTRACT = 2,   // Specific contract
  ERC721 = 3,     // Specific NFT
  ERC20 = 4,      // Specific token
  ERC1155 = 5,    // Specific 1155
}

export interface Delegation {
  type: DelegationType;
  to: `0x${string}`;
  from: `0x${string}`;      // The vault
  rights: `0x${string}`;
  contract: `0x${string}`;
  tokenId: bigint;
}

// Check if wallet can act on behalf of vault (full delegation)
export async function checkDelegateForAll(
  delegate: `0x${string}`,
  vault: `0x${string}`
): Promise<boolean> {
  return await publicClient.readContract({
    address: DELEGATE_REGISTRY_V2,
    abi: delegateAbi,
    functionName: "checkDelegateForAll",
    args: [delegate, vault],
  });
}

// Check delegation for specific NFT contract
export async function checkDelegateForContract(
  delegate: `0x${string}`,
  vault: `0x${string}`,
  contractAddress: `0x${string}`
): Promise<boolean> {
  return await publicClient.readContract({
    address: DELEGATE_REGISTRY_V2,
    abi: delegateAbi,
    functionName: "checkDelegateForContract",
    args: [delegate, vault, contractAddress],
  });
}

// Check delegation for specific NFT token
export async function checkDelegateForERC721(
  delegate: `0x${string}`,
  vault: `0x${string}`,
  contractAddress: `0x${string}`,
  tokenId: bigint
): Promise<boolean> {
  return await publicClient.readContract({
    address: DELEGATE_REGISTRY_V2,
    abi: delegateAbi,
    functionName: "checkDelegateForERC721",
    args: [delegate, vault, contractAddress, tokenId],
  });
}

// Get all vaults that have delegated TO this wallet
export async function getIncomingDelegations(
  wallet: `0x${string}`
): Promise<Delegation[]> {
  const result = await publicClient.readContract({
    address: DELEGATE_REGISTRY_V2,
    abi: delegateAbi,
    functionName: "getIncomingDelegations",
    args: [wallet],
  });
  
  return result.map((d: any) => ({
    type: d.type_,
    to: d.to,
    from: d.from,
    rights: d.rights,
    contract: d.contract_,
    tokenId: d.tokenId,
  }));
}

// Get all wallets this address has delegated TO
export async function getOutgoingDelegations(
  wallet: `0x${string}`
): Promise<Delegation[]> {
  const result = await publicClient.readContract({
    address: DELEGATE_REGISTRY_V2,
    abi: delegateAbi,
    functionName: "getOutgoingDelegations",
    args: [wallet],
  });
  
  return result.map((d: any) => ({
    type: d.type_,
    to: d.to,
    from: d.from,
    rights: d.rights,
    contract: d.contract_,
    tokenId: d.tokenId,
  }));
}
```

### Fetch NFTs from Delegated Vaults

Combine delegate.cash with NFT queries to show all NFTs a player has access to:

```typescript
// packages/client/src/services/player-nft-service.ts
import { getIncomingDelegations, DelegationType } from "./delegate-service";
import { fetchNFTsForWallet, NFTMetadata } from "./nft-service";

export interface PlayerNFT extends NFTMetadata {
  source: "owned" | "delegated";
  vault?: `0x${string}`;  // If delegated, the vault address
}

/**
 * Fetch all NFTs a player has access to:
 * - NFTs they directly own
 * - NFTs in vaults that have delegated to them
 */
export async function fetchAllPlayerNFTs(
  playerWallet: `0x${string}`
): Promise<PlayerNFT[]> {
  const allNfts: PlayerNFT[] = [];
  
  // 1. Get NFTs from player's direct wallet
  const ownedNfts = await fetchNFTsForWallet(playerWallet);
  allNfts.push(...ownedNfts.map(nft => ({ ...nft, source: "owned" as const })));
  
  // 2. Get all incoming delegations
  const delegations = await getIncomingDelegations(playerWallet);
  
  // 3. For each ALL or CONTRACT delegation, fetch NFTs from that vault
  const vaultAddresses = new Set<`0x${string}`>();
  
  for (const delegation of delegations) {
    if (delegation.type === DelegationType.ALL || 
        delegation.type === DelegationType.CONTRACT) {
      vaultAddresses.add(delegation.from);
    }
  }
  
  // 4. Fetch NFTs from each delegated vault
  for (const vaultAddress of vaultAddresses) {
    const vaultNfts = await fetchNFTsForWallet(vaultAddress);
    allNfts.push(...vaultNfts.map(nft => ({
      ...nft,
      source: "delegated" as const,
      vault: vaultAddress,
    })));
  }
  
  return allNfts;
}
```

### Delegation UI Panel

```typescript
// packages/client/src/game/panels/DelegationPanel.tsx
import React, { useEffect, useState } from "react";
import { getIncomingDelegations, Delegation, DelegationType } from "../../services/delegate-service";
import { getEnsName } from "../../services/ens-service";

export function DelegationPanel({ playerWallet }: { playerWallet: `0x${string}` }) {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [vaultNames, setVaultNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const dels = await getIncomingDelegations(playerWallet);
      setDelegations(dels);
      
      // Resolve ENS names for vaults
      const names = new Map<string, string>();
      for (const d of dels) {
        const name = await getEnsName(d.from);
        if (name) names.set(d.from, name);
      }
      setVaultNames(names);
      setLoading(false);
    }
    load();
  }, [playerWallet]);

  if (loading) return <div>Loading delegations...</div>;
  if (delegations.length === 0) return <div>No delegations found</div>;

  return (
    <div className="p-2">
      <h3 className="text-sm font-bold mb-2">Delegated Vaults</h3>
      <p className="text-xs text-gray-400 mb-3">
        These vaults have granted you access to their assets
      </p>
      
      {delegations.map((d, i) => (
        <div key={i} className="p-2 bg-black/20 rounded mb-2">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span className="font-mono text-xs">
              {vaultNames.get(d.from) || `${d.from.slice(0, 6)}...${d.from.slice(-4)}`}
            </span>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            Type: {DelegationType[d.type]}
            {d.type === DelegationType.CONTRACT && (
              <span> • Contract: {d.contract.slice(0, 8)}...</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Blockchain Integration Status

### What Exists

| Feature | Implementation |
|---------|---------------|
| **Wallet Auth** | Privy SDK (MetaMask, Phantom, WalletConnect, etc.) |
| **HD Wallets** | Each character gets derived wallet (BIP-44) |
| **Farcaster** | Social features integration |
| **Wallet Storage** | Addresses persisted in PostgreSQL |

### What Does NOT Exist

- No on-chain tokens or NFTs
- No smart contracts deployed
- No token-gated content
- No play-to-earn mechanics
- No on-chain item ownership

### Blockchain Opportunity

The wallet infrastructure is ready for Web3 features:
- `walletAddress` field exists on users and characters
- Privy handles all wallet interactions
- Database schema supports wallet-linked accounts

Potential contributions:
- ERC-721 for character NFTs
- ERC-1155 for item tokenisation
- Token rewards for achievements
- On-chain trading/marketplace

---

## Contributor Guide

### Development Setup

```bash
# Prerequisites: Bun 1.1.38+, Git LFS, Docker

# Clone and install
git clone https://github.com/HyperscapeAI/hyperscape.git
cd hyperscape
bun install  # Auto-downloads ~200MB assets via Git LFS

# Copy environment files
cp packages/client/.env.example packages/client/.env
cp packages/server/.env.example packages/server/.env

# Configure Privy (required for persistent auth)
# Get credentials from https://dashboard.privy.io

# Build and run
bun run build
bun run cdn:up
bun run dev
```

### Port Allocation

| Port | Service | Command |
|------|---------|---------|
| 3333 | Game Client | `bun run dev` |
| 5555 | Game Server | `bun run dev` |
| 8080 | Asset CDN | `bun run cdn:up` |
| 3400 | Asset Forge UI | `bun run dev:forge` |
| 3401 | Asset Forge API | `bun run dev:forge` |
| 4001 | ElizaOS API | `bun run dev:ai` |

### Code Quality Standards

| Aspect | Standard |
|--------|----------|
| Types | **No `any`** - ESLint enforced |
| Classes | Prefer classes over interfaces |
| Tests | Playwright e2e, no mocks |
| Files | Don't create unnecessary files |
| Documentation | Inline comments, CLAUDE.md |

### Key Files to Understand

| Purpose | File |
|---------|------|
| Package entry | `packages/shared/src/index.ts` |
| ECS base | `packages/shared/src/entities/Entity.ts` |
| Combat | `packages/shared/src/systems/shared/combat/CombatSystem.ts` |
| Networking | `packages/shared/src/systems/client/ClientNetwork.ts` |
| VRM loading | `packages/shared/src/extras/three/createVRMFactory.ts` |
| Avatar config | `packages/shared/src/data/avatars.ts` |

### Contribution Areas

1. **Web3 Features** - Token/NFT integration (infrastructure ready)
2. **Content Creation** - JSON manifests are accessible
3. **AI Agents** - ElizaOS plugin development
4. **Asset Pipeline** - Extend Asset Forge capabilities
5. **Testing** - Many systems need comprehensive tests
6. **Mobile** - Capacitor setup exists but needs polish

---

## Quick Reference

| Question | Answer |
|----------|--------|
| Add custom character? | Convert to VRM, add to `avatars.ts` |
| Add custom building? | GLB file + manifest entry |
| Add custom item? | Edit `items.json` manifest |
| Add new UI panel? | Create in `game/panels/`, register in `Sidebar.tsx` |
| Verify wallet ownership? | Use wagmi/viem (recommended) or Privy - any signature works |
| Query player NFTs? | Alchemy API + delegate.cash for vault access |
| Resolve ENS names? | viem `getEnsName()`, `getEnsAvatar()` |
| Check delegations? | Query delegate.cash registry directly via viem |
| Blockchain-enabled? | Wallet auth only, no tokens yet |
| Asset generation? | Use Asset Forge with OpenAI/Meshy keys |
| Good for contributors? | Yes - clean architecture, active development |

---

## Links

- **Main Repo**: https://github.com/HyperscapeAI/hyperscape
- **Asset Forge**: https://github.com/dreaminglucid/3d-asset-forge
- **Assets Repo**: https://github.com/HyperscapeAI/assets
- **Hyperfy (upstream)**: https://github.com/hyperfy-xyz/hyperfy
- **ElizaOS**: https://elizaos.ai
- **VRM Blender Addon**: https://vrm-addon-for-blender.info/
- **Privy Dashboard**: https://dashboard.privy.io
- **Privy React SDK Docs**: https://docs.privy.io/guide/react/
- **Wagmi Docs**: https://wagmi.sh/react/getting-started
- **Viem Docs**: https://viem.sh/docs/getting-started
- **Alchemy NFT API**: https://docs.alchemy.com/reference/nft-api-quickstart
- **delegate.cash**: https://delegate.xyz
- **delegate.cash Docs**: https://docs.delegate.xyz
- **ENS Docs**: https://docs.ens.domains

---

*Generated from codebase analysis. Last updated: January 2026*

