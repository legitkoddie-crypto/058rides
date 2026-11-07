import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCheck, faGear, faPowerOff, faRightFromBracket, faRoute } from "@fortawesome/free-solid-svg-icons";
import Brand from "../components/Brand";
import { getDriverDashboard, Driver, DriverFinances, formatStatus, money, Ride, RideStatus, setDriverStatus, updateDriverRide, watchRideChanges } from "../api";
import { useAuth } from "../auth/AuthContext";
import FinanceChart from "../components/FinanceChart";
import MapView from "../components/MapView";

type Dashboard = { driver: Driver; rides: Ride[]; finances: DriverFinances };

export default function DriverPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try { setDashboard(await getDriverDashboard(user.id)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your driver account."); }
  }, [user]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    const unsubscribe = watchRideChanges(() => { void refresh(); });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [refresh]);

  async function changeStatus() {
    if (!dashboard) return;
    setBusy(true); setError("");
    try {
      await setDriverStatus(dashboard.driver.status === "ONLINE" ? "OFFLINE" : "ONLINE");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change your status."); }
    finally { setBusy(false); }
  }

  async function action(rideId: number, status: RideStatus) {
    if (!user) return;
    setBusy(true); setError("");
    try {
      await updateDriverRide(rideId, user.id, status);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this ride."); }
    finally { setBusy(false); }
  }

  async function logout() {
    try { await signOut(); navigate("/", { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
  }

  const incomingRides = dashboard?.rides.filter((ride) => ride.status === "NEW") ?? [];
  const pickupMarkers = incomingRides.flatMap((ride) => ride.lat === null || ride.lng === null ? [] : [{
    id: ride.id,
    lat: ride.lat,
    lng: ride.lng,
    label: `Ride #${ride.id} · ${ride.from}`,
  }]);

  return <div className="portal-page">
    <header className="site-header portal-header"><Brand /><div className="header-right"><Link className="text-link" to="/account" aria-label="Account settings"><FontAwesomeIcon icon={faGear} /> Account</Link><Link className="text-link" to="/ride">Customer app <span>→</span></Link></div></header>
    <main className="portal-content driver-content">
      <Link to="/ride" className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Customer app</Link>
      <section className="driver-dashboard">
        <div className="dashboard-welcome"><div><p className="eyebrow">DRIVER DASHBOARD</p><h1>Hi, {dashboard?.driver.full_name || "Driver"}.</h1><p>Manage your availability and ride requests.</p></div><button className="icon-button" onClick={logout} aria-label="Sign out"><FontAwesomeIcon icon={faRightFromBracket} /></button></div>
        {dashboard?.driver.status === "PENDING" || dashboard?.driver.status === "REJECTED" ?
          <div className="driver-review"><span className="ride-status">{dashboard.driver.status === "PENDING" ? "Application pending" : "Application not approved"}</span><p>{dashboard.driver.status === "PENDING" ? "The 058 Rides team will review your application. You can go online once it is approved." : "Contact 058 Rides if you believe this is a mistake."}</p></div> :
          <button className={`availability-card${dashboard?.driver.status === "ONLINE" ? " available" : ""}`} onClick={changeStatus} disabled={!dashboard || busy}>
            <span className="availability-icon"><FontAwesomeIcon icon={faPowerOff} /></span><span><small>YOUR STATUS</small><strong>{dashboard?.driver.status === "ONLINE" ? "You’re online" : "You’re offline"}</strong></span><i className="toggle"><b /></i>
          </button>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {dashboard && !["PENDING", "REJECTED"].includes(dashboard.driver.status) && <>
          <div className="dashboard-stat-grid">
            <div className="dashboard-stat"><span>Completed rides</span><strong>{dashboard.finances.completedCount}</strong></div>
            <div className="dashboard-stat"><span>Your completed earnings</span><strong>{money(dashboard.finances.completedEarnings)}</strong></div>
            <div className="dashboard-stat"><span>Active requests</span><strong>{dashboard.finances.activeCount}</strong></div>
          </div>
          <FinanceChart data={dashboard.finances.daily} mode="earnings" title="Your earnings" />
          <div className="driver-map-section">
            <div className="section-heading"><h2>Request map</h2><span>{incomingRides.length} waiting</span></div>
            <div className="driver-map"><MapView markers={pickupMarkers} /></div>
            {incomingRides.length > 0 && <div className="map-request-list">{incomingRides.map((ride) =>
              <div className="map-request-item" key={ride.id}>
                <i className="route-dot pickup" /><span><strong>{ride.from}</strong><small>Ride #{ride.id} · {ride.lat === null ? "Pickup location unavailable on map" : "Pickup shown on map"}</small></span>
              </div>)}</div>}
            {incomingRides.length === 0 && <p className="map-empty-note">New assigned requests will appear here while you’re online.</p>}
          </div>
        </>}
        <div className="section-heading"><h2>Assigned rides</h2><span>{dashboard?.rides.length || 0}</span></div>
        {!dashboard ? <div className="empty-state">Loading your rides…</div> : dashboard.rides.length === 0 ? <div className="empty-state"><FontAwesomeIcon icon={faRoute} /><strong>Nothing here yet</strong><span>New ride requests will appear here.</span></div> :
          <div className="ride-list">{dashboard.rides.map(ride => <article className="ride-item" key={ride.id}>
            <div className="ride-item-top"><span className={`ride-status status-label-${ride.status.toLowerCase()}`}>{formatStatus(ride.status)}</span><strong>{money(ride.fare)}</strong></div>
            <div className="ride-item-route"><span><i className="route-dot pickup" />{ride.from}</span><span><i className="route-dot dropoff" />{ride.to}</span></div>
            {ride.phone && <a className="customer-phone" href={`tel:${ride.phone}`}>Call customer · {ride.phone}</a>}
            <div className="ride-actions">
              {ride.status === "NEW" && <><button className="button primary" disabled={busy} onClick={() => action(ride.id, "ACCEPTED")}>Accept ride</button><button className="button secondary" disabled={busy} onClick={() => action(ride.id, "DECLINED")}>Decline</button></>}
              {ride.status === "ACCEPTED" && <button className="button primary full-button" disabled={busy} onClick={() => action(ride.id, "STARTED")}>Start trip</button>}
              {ride.status === "STARTED" && <button className="button primary full-button" disabled={busy} onClick={() => action(ride.id, "ARRIVED")}>I’ve arrived</button>}
              {ride.status === "ARRIVED" && <button className="button primary full-button" disabled={busy} onClick={() => action(ride.id, "COMPLETED")}><FontAwesomeIcon icon={faCheck} /> Complete ride</button>}
            </div>
          </article>)}</div>}
      </section>
    </main>
  </div>;
}
