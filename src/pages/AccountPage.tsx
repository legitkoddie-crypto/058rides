import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faLock, faUser } from "@fortawesome/free-solid-svg-icons";
import Brand from "../components/Brand";
import { routeForRole, useAuth } from "../auth/AuthContext";

export default function AccountPage() {
  const { profile, updateProfile, updatePassword } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await updateProfile({ full_name: name.trim(), phone: phone.trim() });
      setNotice("Your account details have been saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your account details.");
    } finally { setBusy(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await updatePassword(password);
      setPassword("");
      setNotice("Your password has been updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your password.");
    } finally { setBusy(false); }
  }

  return <div className="portal-page">
    <header className="site-header portal-header"><Brand /></header>
    <main className="portal-content account-content">
      <Link to={routeForRole(profile?.role)} className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Back to dashboard</Link>
      <section className="portal-card account-card">
        <div className="portal-icon"><FontAwesomeIcon icon={faUser} /></div>
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>Account settings</h1>
        <p className="portal-intro">Update the details saved to your 058 Rides account.</p>
        <form className="portal-form" onSubmit={saveProfile}>
          <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label>
          <label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} required={profile?.role === "driver"} /></label>
          <button className="button primary auth-submit" disabled={busy}>Save account details</button>
        </form>
        <form className="portal-form account-password-form" onSubmit={savePassword}>
          <div className="account-subheading"><FontAwesomeIcon icon={faLock} /><strong>Change password</strong></div>
          <label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
          <button className="button secondary" disabled={busy || password.length < 8}>Update password</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
      </section>
    </main>
  </div>;
}
