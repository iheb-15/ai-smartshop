import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export const PALETTE = ["#1f7a5c", "#6366f1", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#14b8a6", "#f97316"];

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 };

export function RevenueAreaChart({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1f7a5c" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#1f7a5c" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => (name === "revenue" ? [`${Number(v).toFixed(2)} DT`, "CA"] : [v, "Commandes"])} />
        <Area type="monotone" dataKey="revenue" stroke="#1f7a5c" strokeWidth={2} fill="url(#revGrad)" />
        <Line type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, xKey, bars, height = 220, stacked = false, formatter }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 50 : 30} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={formatter} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.label || b.key} fill={b.color || PALETTE[i % PALETTE.length]} radius={[6, 6, 0, 0]} stackId={stacked ? "s" : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleLineChart({ data, xKey, lines, height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lines.map((l, i) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.label || l.key} stroke={l.color || PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, nameKey = "name", valueKey = "value", height = 220, colors = PALETTE }) {
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="85%" paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
              <span className="truncate text-slate-600">{d[nameKey]}</span>
            </span>
            <span className="font-semibold text-ink whitespace-nowrap">
              {d[valueKey]} {total ? <span className="text-slate-400 font-normal">({Math.round((d[valueKey] / total) * 100)}%)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FunnelBars({ steps }) {
  const max = Math.max(...steps.map((s) => s.actors), 1);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const pct = Math.round((s.actors / max) * 100);
        const prev = i > 0 ? steps[i - 1].actors : null;
        const conv = prev ? Math.round((s.actors / prev) * 100) : null;
        return (
          <div key={s.step}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-700">{s.step}</span>
              <span className="text-slate-500">
                {s.actors} visiteur(s) • {s.events} évènement(s)
                {conv != null && <span className={`ml-2 font-bold ${conv >= 50 ? "text-emerald-600" : conv >= 20 ? "text-amber-600" : "text-rose-600"}`}>{conv}% ↓</span>}
              </span>
            </div>
            <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
              <div className="h-full rounded-lg flex items-center px-2 text-[11px] font-bold text-white" style={{ width: `${Math.max(pct, 6)}%`, background: PALETTE[i % PALETTE.length] }}>
                {pct}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
