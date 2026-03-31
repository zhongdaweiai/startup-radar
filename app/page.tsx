export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-6 py-20">
        {/* Header */}
        <header className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Startup Radar
          </h1>
          <p className="text-xl text-slate-400">
            Discover, track, and analyze emerging startups
          </p>
        </header>

        {/* Search Box */}
        <div className="max-w-2xl mx-auto mb-16">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Paste a startup URL or name to research..."
              className="flex-1 px-5 py-3 rounded-lg bg-slate-700/50 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors">
              Research
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            { label: "Startups Tracked", value: "0", icon: "🏢" },
            { label: "Industries", value: "0", icon: "📊" },
            { label: "Last Updated", value: "—", icon: "🕐" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center"
            >
              <div className="text-3xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-sm text-slate-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <p className="text-slate-400">
            No startups tracked yet. Paste a URL above to get started.
          </p>
        </div>

        {/* Footer */}
        <footer className="text-center mt-16 text-slate-500 text-sm">
          Startup Radar — Built by Dawei
        </footer>
      </div>
    </div>
  );
}
