import type { Metadata } from "next";
import { NewSeal } from "./NewSeal";

export const metadata: Metadata = { title: "Seal something" };

export default function Page() {
  return <NewSeal />;
}
