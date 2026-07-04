import { notFound } from "next/navigation";
import { getScan, getScans } from "@/lib/poems";
import PoemView from "@/components/PoemView";

export function generateStaticParams() {
  return getScans().map((s) => ({ scanId: s.scanId }));
}

export default async function PoemPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  const scan = getScan(scanId);
  if (!scan) notFound();
  return <PoemView scan={scan} imageUrl={`/scans/${scanId}.jpg`} />;
}
