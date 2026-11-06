import type { Metadata } from "next";
import { Vault } from "./Vault";

export const metadata: Metadata = { title: "Vault" };
export default function Page() {
  return <Vault />;
}
