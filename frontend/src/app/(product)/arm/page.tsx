import type { Metadata } from "next";
import { ArmFromExtension } from "./ArmFromExtension";

export const metadata: Metadata = { title: "Arm a seal" };
export default function Page() {
  return <ArmFromExtension />;
}
