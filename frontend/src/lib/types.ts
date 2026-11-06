export type PublicConfig = {
  dep: string;
  baseUrl: string;
  arkivAccessKey: string;
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
