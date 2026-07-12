import { notFound } from "next/navigation";
import { getScan } from "@/lib/poems";
import { scanImage } from "@/lib/images";
import PoemView from "@/components/PoemView";

// DB-backed + dynamic (no build-time static generation; renders per request from Postgres).
export const dynamic = "force-dynamic";

export default async function PoemPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const scan = await getScan(scanId);
  if (!scan) notFound();
  return <PoemView scan={scan} imageUrl={scanImage(scanId)} />;
}
