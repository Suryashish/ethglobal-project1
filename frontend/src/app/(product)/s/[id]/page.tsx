import type { Metadata } from "next";
import { Suspense } from "react";
import { SealReader } from "@/components/SealReader";

export const metadata: Metadata = { title: "Sealed message" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <SealReader id={id} />
    </Suspense>
  );
}
