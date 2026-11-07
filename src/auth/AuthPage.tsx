import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCarSide, faEnvelope, faLock, faShieldHalved, faUser } from "@fortawesome/free-solid-svg-icons";
import Brand from "../components/Brand";
import { AppRole, routeForRole, useAuth } from "./AuthContext";
import { isSupabaseConfigured } from "../supabase";

type Props = {
  role: AppRole;
  mode?: "login" | "signup";
};

const content = {
  rider: {
    label: "YOUR HARRISMITH RIDE",
    title: "Rides start here.",
    intro: "Sign in or create your account to book a local ride.",
    loginTitle: "Welcome back.",
    signupTitle: "Create your account.",
    signupLink: "Create an account",
    loginLink: "Sign in",
  },
  driver: {
    label: "058 RIDES · DRIVER PARTNER",
    title: "Drive with 058.",
    intro: "Sign in to manage your driver account and ride requests.",
    loginTitle: "Welcome back.",
    signupTitle: "Apply to drive.",
    signupLink: "Apply to drive",
    loginLink: "Driver sign in",
  },
  admin: {
    label: "058 RIDES · OPERATIONS",
    title: "Operations.",
    intro: "Sign in with an authorized operations account.",
    loginTitle: "Secure sign in.",
    signupTitle: "Secure sign in.",
    signupLink: "",
    loginLink: "Sign in",
  },
};

export default function AuthPage({ role, mode: fixedMode }: Props) {
  const { ready, configured, user, profile, profileError, signIn, signUp, signOut } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(fixedMode || "login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [car, setCar] = useState("");
  const [plate, setPlate] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const text = content[role];
  const isSignup = role !== "admin" && (fixedMode ? fixedMode === "signup" : mode === "signup");
  const dashboardPath = routeForRole(role);

  if (!ready && configured) return <AuthLoading />;
  if (user && !profile && ready) return <AuthLoading message={profileError || "Preparing your account…"} />;
  if (user && profile?.role === role) return <Navigate to={dashboardPath} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (isSignup) {
        const hasSession = await signUp(email.trim(), password, {
          app_role: role,
          full_name: name.trim(),
          phone: phone.trim(),
          ...(role === "driver" ? { car: car.trim(), plate: plate.trim() } : {}),
        });
        if (hasSession) navigate(dashboardPath, { replace: true });
        else setNotice("Check your email to confirm your account. You can sign in after confirmation.");
      } else {
        const signedInProfile = await signIn(email.trim(), password);
        if (!signedInProfile) throw new Error("This account has no 058 Rides profile. Contact support.");
        navigate(routeForRole(signedInProfile.role), { replace: true });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed. Please try again.");
    } finally { setBusy(false); }
  }

  async function leaveOtherAccount() {
    try { await signOut(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
  }

  if (!configured) {
    return <SetupRequired />;
  }

  if (user && profile && profile.role !== role) {
    return <PortalShell role={role}>
      <section className="portal-card">
        <div className="portal-icon"><FontAwesomeIcon icon={faShieldHalved} /></div>
        <p className="eyebrow">{text.label}</p>
        <h1>This account can’t open this page.</h1>
        <p className="portal-intro">Sign out, then use an account with the correct access.</p>
        <button className="button primary full-button" onClick={leaveOtherAccount}>Sign out</button>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </PortalShell>;
  }

  if (user && !profile) {
    return <PortalShell role={role}><AuthLoading message={profileError || "We couldn’t find an app profile for this account."} /></PortalShell>;
  }

  return <PortalShell role={role}>
    <section className="portal-card auth-card">
      <div className="portal-icon"><FontAwesomeIcon icon={role === "admin" ? faShieldHalved : role === "driver" ? faCarSide : faUser} /></div>
      <p className="eyebrow">{text.label}</p>
      <h1>{isSignup ? text.signupTitle : text.loginTitle}</h1>
      <p className="portal-intro">{isSignup ? role === "driver" ? "Send in your driver details. Your account will be ready once approved." : "One account keeps your ride details and bookings together." : text.intro}</p>
      <form className="portal-form" onSubmit={submit}>
        {isSignup && <>
          <label>Full name<input required autoComplete="name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>
          <label>Phone number<input required type="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Your mobile number" /></label>
          {role === "driver" && <>
            <label>Vehicle<input required maxLength={100} value={car} onChange={(event) => setCar(event.target.value)} placeholder="e.g. Toyota Corolla" /></label>
            <label>Registration plate<input required maxLength={30} value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="e.g. ABC 123 FS" /></label>
          </>}
        </>}
        <label>Email address<span className="auth-input"><FontAwesomeIcon icon={faEnvelope} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></span></label>
        <label>Password<span className="auth-input"><FontAwesomeIcon icon={faLock} /><input type="password" required minLength={8} autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "At least 8 characters" : "Your password"} /></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <button className="button primary full-button auth-submit" disabled={busy}>{busy ? "Please wait…" : isSignup ? role === "driver" ? "Submit driver application" : "Create account" : "Sign in"}</button>
      </form>
      {!fixedMode && role !== "admin" && <div className="auth-switch">
        <span>{isSignup ? "Already have an account?" : role === "driver" ? "New to 058 Rides?" : "New to 058 Rides?"}</span>
        <button onClick={() => { setMode(isSignup ? "login" : "signup"); setError(""); setNotice(""); }}>{isSignup ? text.loginLink : text.signupLink}</button>
      </div>}
      {fixedMode === "login" && role === "driver" && <p className="portal-footnote">Interested in driving? <Link to="/driver">Apply to join</Link></p>}
      {fixedMode === "signup" && role === "driver" && <p className="portal-footnote">Already approved? <Link to="/driver-login">Driver sign in</Link></p>}
      {role === "rider" && <p className="portal-footnote">Driving with us? <Link to="/driver-login">Driver sign in</Link></p>}
      {role === "driver" && <p className="portal-footnote">Booking a ride? <Link to="/">Rider sign in</Link></p>}
      {role !== "rider" && <Link className="auth-back-link" to="/"> <FontAwesomeIcon icon={faArrowLeft} /> Back to rider sign in</Link>}
    </section>
  </PortalShell>;
}

function PortalShell({ children, role }: { children: React.ReactNode; role: AppRole }) {
  return <div className="portal-page">
    <header className="site-header portal-header"><Brand />{role === "driver" && <Link className="text-link" to="/">Rider sign in <span>→</span></Link>}</header>
    <main className="portal-content">{children}</main>
  </div>;
}

export function AuthLoading({ message = "Checking your account…" }: { message?: string }) {
  return <div className="auth-loading" role="status"><span className="auth-spinner" />{message}</div>;
}

export function ProfileRecovery({ message }: { message: string }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  return <div className="portal-page">
    <header className="site-header portal-header"><Brand /></header>
    <main className="portal-content"><section className="portal-card">
      <div className="portal-icon"><FontAwesomeIcon icon={faShieldHalved} /></div>
      <p className="eyebrow">ACCOUNT SETUP</p>
      <h1>We couldn’t load your account.</h1>
      <p className="portal-intro">{message}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full-button" onClick={async () => {
        try { await signOut(); navigate("/", { replace: true }); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
      }}>Sign out</button>
    </section></main>
  </div>;
}

export function SetupRequired() {
  return <div className="portal-page">
    <header className="site-header portal-header"><Brand /></header>
    <main className="portal-content"><section className="portal-card">
      <div className="portal-icon"><FontAwesomeIcon icon={faShieldHalved} /></div>
      <p className="eyebrow">SUPABASE CONNECTION</p>
      <h1>One setup step left.</h1>
      <p className="portal-intro">Create a <code>.env.local</code> file in the project root and add your Supabase project’s publishable key. Never use a secret or service-role key in the browser.</p>
      <pre className="setup-code">VITE_SUPABASE_URL=https://kvwmejrkdyfjnqwlsdms.supabase.co{"\n"}VITE_SUPABASE_PUBLISHABLE_KEY=your-public-key</pre>
    </section></main>
  </div>;
}
