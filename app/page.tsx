import { NewsStream } from "./news-stream";
import { getNewsItems, getNewsRefreshStatus } from "@/lib/news";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{
  q?: string;
}>;

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const initialItems = await getNewsItems({ query, limit: 40 });
  const initialRefreshStatus = await getNewsRefreshStatus();

  return (
    <main className="min-h-screen bg-[#f8fafd] text-[#202124]">
      <NewsStream
        initialItems={initialItems}
        initialQuery={query}
        initialRefreshStatus={initialRefreshStatus}
      />
    </main>
  );
}
