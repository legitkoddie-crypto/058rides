import { DailyFinance, money } from "../api";

export default function FinanceChart({ data, mode, title }: {
  data: DailyFinance[];
  mode: "platform" | "earnings";
  title: string;
}) {
  const maximum = Math.max(1, ...data.map((day) => mode === "platform"
    ? (day.platform ?? 0) + (day.driver ?? 0)
    : day.earnings ?? 0));

  return <section className="finance-chart" aria-label={title}>
    <div className="finance-chart-heading"><h3>{title}</h3><span>Last 7 days</span></div>
    <div className="finance-chart-bars">
      {data.map((day) => {
        const platform = day.platform ?? 0;
        const driver = day.driver ?? 0;
        const earnings = day.earnings ?? 0;
        const total = mode === "platform" ? platform + driver : earnings;
        const date = new Date(`${day.date}T12:00:00`);
        return <div className="finance-chart-day" key={day.date} title={`${date.toLocaleDateString()}: ${money(total)}`}>
          <div className="finance-bar-track">
            {mode === "platform" ? <>
              <span className="finance-bar finance-bar-driver" style={{ height: `${driver / maximum * 100}%` }} />
              <span className="finance-bar finance-bar-platform" style={{ height: `${platform / maximum * 100}%` }} />
            </> : <span className="finance-bar finance-bar-earnings" style={{ height: `${earnings / maximum * 100}%` }} />}
          </div>
          <small>{date.toLocaleDateString(undefined, { weekday: "short" })}</small>
        </div>;
      })}
    </div>
    <div className="finance-chart-legend">
      {mode === "platform" ? <>
        <span><i className="legend-platform" /> Platform</span>
        <span><i className="legend-driver" /> Driver</span>
      </> : <span><i className="legend-earnings" /> Your completed earnings</span>}
    </div>
  </section>;
}
