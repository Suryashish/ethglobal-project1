export type PublicConfig = {
  dep: string;
  baseUrl: string;
  arkivAccessKey: string;
  /** Optional Arkiv RPC override (e.g. a local arkiv-reth dev node). Empty = Rabdi testnet. */
  arkivRpcUrl?: string;
  verifierAddress: string;
  mirrorAddress: string;
  escrowPublicKey: string;
  gatedPublicKey: string;
  swarmGateway: string;
  silentReleaseAddress: string;
  sepoliaExplorer: string;
  arkivExplorer: string;
  worldMode: "mock" | "live";
  worldAppId: string;
  worldEnvironment: string;
};
