// Where scan images live. Dev: local /scans (Postgres.app + public/). Prod: CloudFront/S3 via
// NEXT_PUBLIC_IMAGE_BASE (e.g. https://dxxxx.cloudfront.net). Empty base = same-origin /scans.
export const IMG_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE || "";

export const scanImage = (scanId: string) => `${IMG_BASE}/scans/${scanId}.jpg`;

// A stored asset path like "/scans/crops/set-1-p2.png?v=123" → absolute in prod, unchanged in dev.
export const assetUrl = (p?: string | null) => (p ? (p.startsWith("/") ? IMG_BASE + p : p) : "");
