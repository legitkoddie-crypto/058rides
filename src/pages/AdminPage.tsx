import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBan, faCarSide, faChartLine, faCheck, faGear, faRightFromBracket, faRotate, faUsers, faWallet } from "@fortawesome/free-solid-svg-icons";
import Brand from "../components/Brand";
import { AdminAccount, AdminFinances, adminUpdateDriver, adminUpdateRide, Driver, formatStatus, getAdminAccounts, getAdminDashboard, money, Ride, RideStatus, updateAdminAccount, updatePlatformFee, watchRideChanges } from "../api";
import { useAuth } from "../auth/AuthContext";
import FinanceChart from "../components/FinanceChart";

type AdminSnapshot = {
  newCount: number;
  pendingDrivers: number;
  requests: Ride[];
  drivers: Driver[];
  finances: AdminFinances;
  platformFee: number;
};
type AdminTab = "rides" | "drivers" | "finance" | "accounts";

export default function AdminPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [tab, setTab] = useState<AdminTab>("rides");
  const [feeInput, setFeeInput] = useState("");
  const [feeDirty, setFeeDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getAdminDashboard();
      setSnapshot(next);
      if (!feeDirty) setFeeInput(String(next.platformFee));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load admin data."); }
  }, [feeDirty]);

  const refreshAccounts = useCallback(async () => {
    try {
      setAccounts(await getAdminAccounts());
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load accounts."); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    const unsubscribe = watchRideChanges(() => { void refresh(); });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [refresh]);

  useEffect(() => {
    if (tab === "accounts" && !accounts) void refreshAccounts();
  }, [tab, accounts, refreshAccounts]);

  function selectTab(nextTab: AdminTab) {
    setTab(nextTab);
    setError("");
  }

  async function updateRide(id: number, changes: { status?: RideStatus; driver_id?: string | null }) {
    setBusy(true); setError("");
    try { await adminUpdateRide(id, changes); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update ride."); }
    finally { setBusy(false); }
  }

  async function updateDriver(userId: string, status: string) {
    setBusy(true); setError("");
    try { await adminUpdateDriver(userId, status); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update driver."); }
    finally { setBusy(false); }
  }

  async function updateAccount(account: AdminAccount) {
    setBusy(true); setError("");
    try {
      await updateAdminAccount(account.id, account.suspended ? "restore" : "suspend");
      await refreshAccounts();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update account access."); }
    finally { setBusy(false); }
  }

  async function savePlatformFee(event: FormEvent) {
    event.preventDefault();
    const amount = Number(feeInput);
    if (!Number.isInteger(amount) || amount < 0 || amount > 10000) {
      setError("Enter a whole-number platform share from R0 to R10,000.");
      return;
    }
    setBusy(true); setError("");
    try {
      await updatePlatformFee(amount);
      setFeeDirty(false);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the platform share."); }
    finally { setBusy(false); }
  }

  async function logout() {
    try { await signOut(); navigate("/", { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
  }

  return <div className="portal-page admin-page">
    <header className="site-header portal-header"><Brand /><div className="header-right"><Link className="text-link" to="/account"><FontAwesomeIcon icon={faGear} /> Account</Link><button className="text-link admin-logout" onClick={logout}>Sign out <span>→</span></button></div></header>
    <main className="admin-content">
      <Link to="/" className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Home</Link>
      <section className="admin-dashboard">
        <div className="admin-title-row"><div><p className="eyebrow">058 RIDES · OPERATIONS</p><h1>Dashboard</h1></div><div className="admin-head-actions"><button className="icon-button" onClick={() => { void refresh(); if (tab === "accounts") void refreshAccounts(); }} aria-label="Refresh"><FontAwesomeIcon icon={faRotate} /></button><button className="icon-button" onClick={logout} aria-label="Sign out"><FontAwesomeIcon icon={faRightFromBracket} /></button></div></div>
        <div className="admin-stats"><div><span>New rides</span><strong>{snapshot?.newCount ?? "—"}</strong></div><div><span>Driver applications</span><strong>{snapshot?.pendingDrivers ?? "—"}</strong></div><div><span>Drivers</span><strong>{snapshot?.drivers.length ?? "—"}</strong></div></div>
        <div className="admin-tabs">
          <button className={tab === "rides" ? "active" : ""} onClick={() => selectTab("rides")}><FontAwesomeIcon icon={faCarSide} /> Rides {snapshot?.newCount ? <b>{snapshot.newCount}</b> : null}</button>
          <button className={tab === "drivers" ? "active" : ""} onClick={() => selectTab("drivers")}><FontAwesomeIcon icon={faUsers} /> Drivers {snapshot?.pendingDrivers ? <b>{snapshot.pendingDrivers}</b> : null}</button>
          <button className={tab === "finance" ? "active" : ""} onClick={() => selectTab("finance")}><FontAwesomeIcon icon={faChartLine} /> Finance</button>
          <button className={tab === "accounts" ? "active" : ""} onClick={() => selectTab("accounts")}><FontAwesomeIcon icon={faWallet} /> Accounts</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!snapshot ? <div className="empty-state">Loading dashboard…</div> : tab === "rides" ? snapshot.requests.length === 0 ? <div className="empty-state"><FontAwesomeIcon icon={faCarSide} /><strong>No rides yet</strong><span>New bookings will show up here.</span></div> :
          <div className="ride-list">{snapshot.requests.map(ride => <article className="ride-item" key={ride.id}>
            <div className="ride-item-top"><span className={`ride-status status-label-${ride.status.toLowerCase()}`}>{formatStatus(ride.status)}</span><strong>{money(ride.fare)}</strong></div>
            <div className="ride-item-route"><span><i className="route-dot pickup" />{ride.from}</span><span><i className="route-dot dropoff" />{ride.to}</span></div>
            <div className="admin-ride-meta"><span>{ride.phone || "No phone provided"}</span><span>{ride.driverName || "No driver assigned"}</span></div>
            <div className="ride-actions">
              {ride.status === "NEW" && <select aria-label="Assign driver" value={ride.driverId ?? ""} onChange={event => void updateRide(ride.id, { driver_id: event.target.value || null })}><option value="">Unassigned</option>{snapshot.drivers.filter(driver => ["ONLINE", "OFFLINE"].includes(driver.status)).map(driver => <option value={driver.user_id} key={driver.user_id}>{driver.full_name}</option>)}</select>}
              {ride.status !== "COMPLETED" && ride.status !== "CANCELLED" && ride.status !== "DECLINED" && <button className="button primary" disabled={busy} onClick={() => void updateRide(ride.id, { status: ride.status === "NEW" ? "ACCEPTED" : ride.status === "ACCEPTED" ? "STARTED" : ride.status === "STARTED" ? "ARRIVED" : "COMPLETED" })}><FontAwesomeIcon icon={faCheck} /> Update ride</button>}
              {ride.phone && <a className="button secondary" href={`tel:${ride.phone}`}>Call rider</a>}
            </div>
          </article>)}</div> : tab === "drivers" ?
          snapshot.drivers.length === 0 ? <div className="empty-state"><FontAwesomeIcon icon={faUsers} /><strong>No driver applications</strong><span>New applications will be listed here.</span></div> :
          <div className="ride-list">{snapshot.drivers.map(driver => <article className="ride-item driver-item" key={driver.user_id}>
            <div className="ride-item-top"><strong>{driver.full_name}</strong><span className={`ride-status status-label-${driver.status.toLowerCase()}`}>{driver.status}</span></div>
            <div className="admin-ride-meta"><span>{driver.car} · {driver.plate}</span><a href={`tel:${driver.phone}`}>{driver.phone}</a></div>
            {driver.status === "PENDING" && <div className="ride-actions"><button className="button primary" disabled={busy} onClick={() => void updateDriver(driver.user_id, "OFFLINE")}>Approve</button><button className="button secondary" disabled={busy} onClick={() => void updateDriver(driver.user_id, "REJECTED")}>Decline</button></div>}
            {driver.status === "REJECTED" && <div className="ride-actions"><button className="button secondary" disabled={busy} onClick={() => void updateDriver(driver.user_id, "OFFLINE")}>Restore driver</button></div>}
          </article>)}</div> : tab === "finance" ? <div className="finance-panel">
            <form className="platform-fee-card" onSubmit={savePlatformFee}>
              <div><p className="eyebrow">SAVED PLATFORM SETTINGS</p><strong>Platform share per booking</strong><span>Captured when a ride is booked. Cancelled or declined rides are reversed.</span></div>
              <label>R<input type="number" min="0" max="10000" step="1" value={feeInput} onChange={(event) => { setFeeInput(event.target.value); setFeeDirty(true); }} aria-label="Platform share amount in rand" /></label>
              <button className="button primary" disabled={busy || !feeDirty}>Save</button>
            </form>
            <div className="finance-stat-grid">
              <div className="finance-stat"><span>Booked fare value</span><strong>{money(snapshot.finances.bookedGross)}</strong></div>
              <div className="finance-stat admin-finance-private"><span>Platform share booked</span><strong>{money(snapshot.finances.platformRevenue)}</strong></div>
              <div className="finance-stat admin-finance-private"><span>Driver share booked</span><strong>{money(snapshot.finances.driverPayable)}</strong></div>
              <div className="finance-stat"><span>Completed rides</span><strong>{snapshot.finances.completedCount}</strong></div>
              <div className="finance-stat admin-finance-private"><span>Platform share completed</span><strong>{money(snapshot.finances.completedPlatformRevenue)}</strong></div>
              <div className="finance-stat admin-finance-private"><span>Driver earnings completed</span><strong>{money(snapshot.finances.completedDriverEarnings)}</strong></div>
            </div>
            <FinanceChart data={snapshot.finances.daily} mode="platform" title="Fare split · last 7 days" />
            <div className="section-heading"><h2>Recent ride splits</h2><span>{snapshot.finances.rideSplits.length}</span></div>
            {snapshot.finances.rideSplits.length === 0 ? <div className="empty-state">No ride settlements yet.</div> :
              <div className="ride-list">{snapshot.finances.rideSplits.map((split) => <article className="ride-item finance-ride-item" key={split.id}>
                <div className="ride-item-top"><strong>Ride #{split.id}</strong><span className={`ride-status status-label-${split.status.toLowerCase()}`}>{split.reversed ? "REVERSED" : split.status}</span></div>
                <div className="finance-split-row"><span>Fare <strong>{money(split.fare)}</strong></span><span>Platform <strong>{money(split.platformShare)}</strong></span><span>Driver <strong>{money(split.driverEarning)}</strong></span></div>
                <div className="admin-ride-meta"><span>{split.riderName || "Rider"}</span><span>{split.driverName || "Unassigned"}</span><time>{new Date(split.createdAt).toLocaleDateString()}</time></div>
              </article>)}</div>}
          </div> : !accounts ? <div className="empty-state">Loading accounts…</div> : accounts.length === 0 ? <div className="empty-state"><FontAwesomeIcon icon={faUsers} /><strong>No accounts found</strong></div> :
          <div className="ride-list">{accounts.map((account) => <article className="ride-item account-item" key={account.id}>
            <div className="ride-item-top"><strong>{account.fullName || account.email || "Account"}</strong><span className={`ride-status status-label-${account.suspended ? "rejected" : "offline"}`}>{account.suspended ? "SUSPENDED" : account.role.toUpperCase()}</span></div>
            <div className="admin-ride-meta"><span>{account.email || "No email address"}</span><span>{account.phone || "No phone number"}</span></div>
            <div className="account-meta"><span>Joined {new Date(account.createdAt).toLocaleDateString()}</span><span>{account.lastSignInAt ? `Last active ${new Date(account.lastSignInAt).toLocaleDateString()}` : "Never signed in"}</span></div>
            <div className="ride-actions"><button className={`button ${account.suspended ? "primary" : "secondary"}`} disabled={busy} onClick={() => void updateAccount(account)}><FontAwesomeIcon icon={account.suspended ? faRotate : faBan} /> {account.suspended ? "Restore access" : "Suspend access"}</button></div>
          </article>)}</div>}
        <p className="quiet-note"><FontAwesomeIcon icon={faRotate} /> Dashboard refreshes automatically.</p>
      </section>
    </main>
  </div>;
}
