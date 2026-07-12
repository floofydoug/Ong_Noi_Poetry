import { promises as fs } from "fs";
import path from "path";

// Where uploaded assets (re-analyze crops) go. Prod: S3 (bucket via S3_BUCKET), served through
// CloudFront. Dev: local public/ so it serves at /scans. Returns the stored path (leading "/").
const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || "us-west-1";

export async function saveCrop(name: string, buf: Buffer): Promise<string> {
  const key = `scans/crops/${name}.png`;
  if (BUCKET) {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: REGION });
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: "image/png" }));
    return `/${key}`;
  }
  await fs.mkdir(path.join(process.cwd(), "public", "scans", "crops"), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), "public", key), buf);
  return `/${key}`;
}
