import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const res = await fetch(`https://unavatar.io/x/${handle}`, {
    headers: { "x-api-key": process.env.UNAVATAR_API_KEY! },
  });

  if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
    return new NextResponse(null, { status: 404 });
  }

  const image = await res.arrayBuffer();
  return new NextResponse(image, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=86400",
    },
  });
}
