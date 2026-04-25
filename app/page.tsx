const watchlist = [
  {
    company: "Northstar Data",
    market: "AI infrastructure",
    stage: "Seed",
    score: 86,
    signal: "Hiring velocity",
  },
  {
    company: "Keystone Labs",
    market: "Developer tools",
    stage: "Series A",
    score: 79,
    signal: "Open-source pull",
  },
  {
    company: "Tandem Bio",
    market: "Bio automation",
    stage: "Pre-seed",
    score: 72,
    signal: "Founder-market fit",
  },
];

const signalMix = [
  { label: "Talent", value: 84, color: "bg-emerald-500" },
  { label: "Market", value: 76, color: "bg-violet-500" },
  { label: "Product", value: 68, color: "bg-amber-500" },
  { label: "Momentum", value: 91, color: "bg-rose-500" },
];

const pipeline = [
  { label: "New", value: 18 },
  { label: "Research", value: 7 },
  { label: "Diligence", value: 3 },
  { label: "Watch", value: 11 },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f4ef] text-[#202124]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-[#d9d4c9] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64746b]">
              Venture intelligence
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#121413] sm:text-4xl">
              Startup Radar
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
              Render ready
            </span>
            <span className="rounded-full border border-[#d9d4c9] bg-white px-3 py-1 text-[#5f665f]">
              startup-radar
            </span>
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 rounded-lg border border-[#d9d4c9] bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#465048]">
                  Research target
                </span>
                <input
                  className="h-12 w-full rounded-md border border-[#cfc8bb] bg-[#fbfaf7] px-4 text-base outline-none transition focus:border-[#1b6b55] focus:ring-4 focus:ring-emerald-100"
                  placeholder="Company URL, founder name, or market"
                  type="text"
                />
              </label>
              <button className="h-12 rounded-md bg-[#1b6b55] px-5 text-sm font-semibold text-white transition hover:bg-[#155543]">
                Scan
              </button>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-lg border border-[#d9d4c9] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#ebe7df] px-4 py-3">
                  <h2 className="text-base font-semibold">Priority Watchlist</h2>
                  <span className="text-sm text-[#69736b]">3 active</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="text-xs uppercase text-[#737a73]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Company</th>
                        <th className="px-4 py-3 font-semibold">Market</th>
                        <th className="px-4 py-3 font-semibold">Stage</th>
                        <th className="px-4 py-3 font-semibold">Lead Signal</th>
                        <th className="px-4 py-3 text-right font-semibold">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ebe7df]">
                      {watchlist.map((item) => (
                        <tr key={item.company}>
                          <td className="px-4 py-4 font-medium">{item.company}</td>
                          <td className="px-4 py-4 text-[#5d665e]">{item.market}</td>
                          <td className="px-4 py-4 text-[#5d665e]">{item.stage}</td>
                          <td className="px-4 py-4 text-[#5d665e]">{item.signal}</td>
                          <td className="px-4 py-4 text-right">
                            <span className="rounded-full bg-[#fff4d8] px-3 py-1 font-semibold text-[#8a5900]">
                              {item.score}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-[#d9d4c9] bg-[#17201b] p-4 text-white shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Radar Map</h2>
                  <span className="text-sm text-emerald-100">Live view</span>
                </div>
                <div className="relative mx-auto mt-6 aspect-square max-w-[280px] rounded-full border border-emerald-200/30 bg-[radial-gradient(circle_at_center,rgba(52,211,153,0.18),rgba(23,32,27,0)_62%)]">
                  <div className="absolute inset-[14%] rounded-full border border-white/10" />
                  <div className="absolute inset-[28%] rounded-full border border-white/10" />
                  <div className="absolute inset-[42%] rounded-full border border-white/10" />
                  <div className="absolute left-[50%] top-0 h-full w-px bg-white/10" />
                  <div className="absolute left-0 top-[50%] h-px w-full bg-white/10" />
                  <span className="absolute left-[63%] top-[18%] h-3 w-3 rounded-full bg-rose-400 shadow-[0_0_20px_rgba(251,113,133,0.8)]" />
                  <span className="absolute left-[31%] top-[37%] h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.8)]" />
                  <span className="absolute left-[55%] top-[57%] h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
                  <span className="absolute left-[22%] top-[67%] h-3 w-3 rounded-full bg-violet-300 shadow-[0_0_20px_rgba(196,181,253,0.8)]" />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-2xl font-semibold">42</p>
                    <p className="text-emerald-100/80">tracked markets</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">12</p>
                    <p className="text-emerald-100/80">fresh signals</p>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <section className="rounded-lg border border-[#d9d4c9] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Signal Mix</h2>
              <div className="mt-4 space-y-4">
                {signalMix.map((signal) => (
                  <div key={signal.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{signal.label}</span>
                      <span className="text-[#657067]">{signal.value}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#ece7dd]">
                      <div
                        className={`h-full rounded-full ${signal.color}`}
                        style={{ width: `${signal.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#d9d4c9] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Pipeline</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {pipeline.map((item) => (
                  <div
                    className="rounded-md border border-[#ebe7df] bg-[#fbfaf7] p-3"
                    key={item.label}
                  >
                    <p className="text-2xl font-semibold">{item.value}</p>
                    <p className="text-sm text-[#657067]">{item.label}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#d9d4c9] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Deployment</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#657067]">Repository</dt>
                  <dd className="font-medium">startup-radar</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#657067]">Branch</dt>
                  <dd className="font-medium">master</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#657067]">Hosting</dt>
                  <dd className="font-medium">Render Static</dd>
                </div>
              </dl>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
