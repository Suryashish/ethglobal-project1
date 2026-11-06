import type { Metadata } from "next";
import { OpenSeal } from "./OpenSeal";

export const metadata: Metadata = { title: "Open a seal" };
export default function Page() {
  return <OpenSeal />;
}
