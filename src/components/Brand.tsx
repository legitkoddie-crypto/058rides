import { Link } from "react-router-dom";

export default function Brand() {
  return <Link to="/" className="brand" aria-label="058 Rides home">
    <span className="brand-mark">058</span>
    <span className="brand-copy"><strong>RIDES</strong><small>HARRISMITH</small></span>
  </Link>;
}
