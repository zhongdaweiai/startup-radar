import { NextRequest, NextResponse } from "next/server";
import { getNewsItems, getNewsRefreshStatus } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") ?? "";
  const limitParam = Number(searchParams.get("limit") ?? 60);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(limitParam, 100))
    : 60;

  try {
    const items = await getNewsItems({ query, limit });
    const refreshStatus = await getNewsRefreshStatus();

    return NextResponse.json({
      items,
      refreshStatus,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Unable to load news",
        items: [],
      },
      { status: 500 },
    );
  }
}
