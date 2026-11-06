import type { Metadata } from "next";
import { VerifyReader } from "./VerifyReader";

export const metadata: Metadata = { title: "Verify as a reader" };
export default function Page() {
  return <VerifyReader />;
}
