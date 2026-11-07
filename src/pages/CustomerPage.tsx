import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faArrowUp, faBolt, faCheck, faChevronLeft, faGear, faLocationArrow, faLocationDot, faPhone, faRotate, faShieldHalved, faXmark, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import Brand from "../components/Brand";
import MapView, { MapPoint } from "../components/MapView";
import { cancelRide, createRide, formatStatus, getRide, money, Ride, RideStatus } from "../api";
import { quote } from "../../lib/pricing.js";
import { useAuth } from "../auth/AuthContext";
import { Link } from "react-router-dom";

const destinations = ["Town", "Checkers", "Qwaqwa Road", "Hospital"];

export default function CustomerPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const clientStorage = `058-active-ride-${user?.id ?? "unknown"}`;
  const [from, setFrom] = useState("My current location");
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [ride, setRide] = useState<Ride | null>(() => {
    try { return JSON.parse(localStorage.getItem(clientStorage) || "null"); } catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const quotedFare = useMemo(() => quote(from, to).total, [from, to]);

  useEffect(() => {
    if (!ride?.id || !user?.id || ["COMPLETED", "CANCELLED", "DECLINED"].includes(ride.status)) return;
    let active = true;
    const poll = async () => {
      try {
        const fresh = await getRide(ride.id, user!.id);
        if (active) {
          setRide(fresh);
          setError("");
          localStorage.setItem(clientStorage, JSON.stringify(fresh));
        }
      } catch {
        if (active) setError("Connection interrupted. Ride updates will retry automatically.");
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [ride?.id, ride?.status, user?.id]);

  function locate() {
    if (!navigator.geolocation) { setError("Location is not available on this device."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPoint({ lat: coords.latitude, lng: coords.longitude });
        setFrom("My current location");
        setLocating(false);
      },
      () => { setError("Location permission was denied. You can enter a pickup address instead."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function book(event: FormEvent) {
    event.preventDefault();
    if (!from.trim() || !to.trim()) { setError("Enter your pickup and destination to continue."); return; }
    setBusy(true); setError("");
    try {
      const created = await createRide({
        riderId: user!.id,
        from: from.trim(),
        to: to.trim(),
        phone: phone.trim() || profile?.phone || "",
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
      });
      setRide(created);
      localStorage.setItem(clientStorage, JSON.stringify(created));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not book your ride. Please try again."); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!ride) return;
    setBusy(true);
    try {
      const updated = await cancelRide(ride.id, user!.id);
      setRide(updated); localStorage.setItem(clientStorage, JSON.stringify(updated));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel this ride."); }
    finally { setBusy(false); }
  }

  function newRide() {
    setRide(null); setTo(""); setPhone(""); setError(""); localStorage.removeItem(clientStorage);
  }

  const active = ride && !["COMPLETED", "CANCELLED", "DECLINED"].includes(ride.status);
  const steps: RideStatus[] = ["NEW", "ACCEPTED", "STARTED", "ARRIVED"];
  const progress = Math.max(0, steps.indexOf(ride?.status || "NEW"));

  return <div className="customer-page">
    <header className="site-header">
      <Brand />
      <div className="header-right"><span className="service-pill"><span className="pulse-dot" /> Local rides</span><Link className="icon-button" to="/account" aria-label="Account settings"><FontAwesomeIcon icon={faGear} /></Link><button className="icon-button customer-signout" onClick={async () => { try { await signOut(); navigate("/", { replace: true }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); } }} aria-label="Sign out"><FontAwesomeIcon icon={faRightFromBracket} /></button></div>
    </header>
    <main className="booking-layout">
      <section className="map-section">
        <MapView point={point} />
        <button className={`locate-control${locating ? " is-loading" : ""}`} onClick={locate} aria-label="Use my current location">
          <FontAwesomeIcon icon={faLocationArrow} />
        </button>
        <div className="map-caption"><strong>Your city. Your ride.</strong><span>Safe, local rides in Harrismith.</span></div>
      </section>

      <section className="booking-panel">
        {active ? (
          <div className="ride-status-card">
            <button className="back-button" onClick={newRide}><FontAwesomeIcon icon={faChevronLeft} /> New ride</button>
            <div className="status-heading">
              <span className={`status-icon status-${ride!.status.toLowerCase()}`}>
                <FontAwesomeIcon icon={ride!.status === "ARRIVED" ? faCheck : faLocationDot} />
              </span>
              <div><p className="eyebrow">YOUR RIDE</p><h1>{formatStatus(ride!.status)}</h1></div>
            </div>
            <div className="progress-track"><span style={{ width: `${(progress / 3) * 100}%` }} /></div>
            <div className="route-summary">
              <p><i className="route-dot pickup" /><span><small>PICKUP</small>{ride!.from}</span></p>
              <p><i className="route-dot dropoff" /><span><small>DROP-OFF</small>{ride!.to}</span></p>
            </div>
            {ride!.driver && <div className="driver-confirmation"><div className="driver-avatar"><FontAwesomeIcon icon={faBolt} /></div><div><strong>{ride!.driver.full_name}</strong><span>{ride!.driver.car} · {ride!.driver.plate}</span></div><a className="round-action" href={`tel:${ride!.driver.phone}`} aria-label="Call driver"><FontAwesomeIcon icon={faPhone} /></a></div>}
            <div className="ride-total"><span>Estimated fare</span><strong>{money(ride!.fare)}</strong></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="button-row">
              <button className="button secondary" onClick={cancel} disabled={busy}><FontAwesomeIcon icon={faXmark} /> Cancel ride</button>
              {ride!.driver?.phone && <a className="button secondary" href={`tel:${ride!.driver.phone}`}><FontAwesomeIcon icon={faPhone} /> Call driver</a>}
            </div>
            <p className="quiet-note"><FontAwesomeIcon icon={faRotate} /> Updates automatically every few seconds.</p>
          </div>
        ) : ride ? (
          <div className="ride-status-card finished-card">
            <span className="status-icon"><FontAwesomeIcon icon={ride.status === "COMPLETED" ? faCheck : faXmark} /></span>
            <p className="eyebrow">RIDE {ride.status === "COMPLETED" ? "COMPLETE" : "CLOSED"}</p>
            <h1>{formatStatus(ride.status)}</h1>
            <p className="finished-route">{ride.from} <FontAwesomeIcon icon={faArrowRight} /> {ride.to}</p>
            <button className="button primary full-button" onClick={newRide}>Book another ride</button>
          </div>
        ) : (
          <form className="booking-card" onSubmit={book}>
            <div className="booking-title"><div><p className="eyebrow">058 RIDES · HARRISMITH</p><h1>Where to?</h1></div><span className="secure-tag"><FontAwesomeIcon icon={faShieldHalved} /> Local & reliable</span></div>
            <div className="trip-fields">
              <div className="trip-rail"><i /><i /></div>
              <label className="input-card"><span>Pickup</span><input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Enter pickup location" maxLength={200} required /><button type="button" className="input-action" onClick={locate} aria-label="Use GPS"><FontAwesomeIcon icon={faLocationArrow} /></button></label>
              <label className="input-card"><span>Drop-off</span><input value={to} onChange={(event) => setTo(event.target.value)} placeholder="Where are you going?" maxLength={200} required /><FontAwesomeIcon className="destination-icon" icon={faArrowUp} /></label>
            </div>
            <div className="quick-destinations"><span>Popular</span>{destinations.map((destination) => <button key={destination} type="button" className={to === destination ? "selected" : ""} onClick={() => setTo(destination)}>{destination}</button>)}</div>
            <label className="phone-input"><FontAwesomeIcon icon={faPhone} /><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number (optional)" maxLength={30} /></label>
            <div className="fare-preview"><span>Fixed fare estimate</span><strong>{money(quotedFare)}</strong></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary book-button" type="submit" disabled={busy}><span>{busy ? "Finding your ride..." : "Confirm pickup"}</span><span className="button-price">{money(quotedFare)} <FontAwesomeIcon icon={faArrowRight} /></span></button>
            <p className="fine-print">Your driver will be confirmed as soon as a nearby ride is available.</p>
          </form>
        )}
        <div className="trust-row"><span><FontAwesomeIcon icon={faShieldHalved} /> Local drivers</span><span><FontAwesomeIcon icon={faBolt} /> Quick booking</span><span><FontAwesomeIcon icon={faCheck} /> Clear fares</span></div>
        <footer className="customer-footer"><span>© 058 Rides · Harrismith</span><a href="/driver">Drive with us <FontAwesomeIcon icon={faArrowRight} /></a></footer>
      </section>
    </main>
  </div>;
}
