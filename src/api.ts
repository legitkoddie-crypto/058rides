import { requireSupabase } from "./supabase";

export type RideStatus = "NEW" | "ACCEPTED" | "STARTED" | "ARRIVED" | "COMPLETED" | "CANCELLED" | "DECLINED";

export type Ride = {
  id: number;
  riderId: string;
  from: string;
  to: string;
  phone: string;
  status: RideStatus;
  fare: number;
  createdAt: string;
  driverId: string | null;
  lat: number | null;
  lng: number | null;
  driverName?: string | null;
  driver?: { user_id: string; full_name: string; car: string; plate: string; phone: string } | null;
};

export type Driver = {
  user_id: string;
  full_name: string;
  car: string;
  plate: string;
  phone: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
};

type RideRow = {
  id: number;
  rider_id: string;
  driver_id: string | null;
  from_place: string;
  to_place: string;
  phone: string;
  status: RideStatus;
  fare: number;
  created_at: string;
  lat: number | null;
  lng: number | null;
  driver: RideDriver | RideDriver[] | null;
};

type RideDriver = Pick<Driver, "user_id" | "full_name" | "car" | "plate" | "phone">;

const rideSelection = "id, rider_id, driver_id, from_place, to_place, phone, status, fare, created_at, lat, lng, accepted_at, started_at, completed_at, driver:drivers!rides_driver_id_fkey(user_id, full_name, car, plate, phone)";

function mapRide(row: RideRow): Ride {
  const driver = Array.isArray(row.driver) ? row.driver[0] ?? null : row.driver;
  return {
    id: row.id,
    riderId: row.rider_id,
    from: row.from_place,
    to: row.to_place,
    phone: row.phone,
    status: row.status,
    fare: row.fare,
    createdAt: row.created_at,
    driverId: row.driver_id,
    lat: row.lat,
    lng: row.lng,
    driverName: driver?.full_name ?? null,
    driver: driver ? {
      user_id: driver.user_id,
      full_name: driver.full_name,
      car: driver.car,
      plate: driver.plate,
      phone: driver.phone,
    } : null,
  };
}

export async function createRide(input: {
  riderId: string;
  from: string;
  to: string;
  phone: string;
  lat: number | null;
  lng: number | null;
}) {
  const { data, error } = await requireSupabase()
    .from("rides")
    .insert({
      rider_id: input.riderId,
      from_place: input.from,
      to_place: input.to,
      phone: input.phone,
      lat: input.lat,
      lng: input.lng,
    })
    .select(rideSelection)
    .single();
  if (error) throw error;
  return mapRide(data as RideRow);
}

export async function getRide(id: number, riderId: string) {
  const { data, error } = await requireSupabase()
    .from("rides")
    .select(rideSelection)
    .eq("id", id)
    .eq("rider_id", riderId)
    .single();
  if (error) throw error;
  return mapRide(data as RideRow);
}

export async function cancelRide(id: number, riderId: string) {
  const { data, error } = await requireSupabase()
    .from("rides")
    .update({ status: "CANCELLED" })
    .eq("id", id)
    .eq("rider_id", riderId)
    .in("status", ["NEW", "ACCEPTED"])
    .select(rideSelection)
    .single();
  if (error) throw error;
  return mapRide(data as RideRow);
}

export type DailyFinance = { date: string; rides: number; gross?: number; platform?: number; driver?: number; earnings?: number };
export type DriverFinances = { completedCount: number; completedEarnings: number; activeCount: number; daily: DailyFinance[] };
export type AdminFinances = {
  bookedCount: number;
  completedCount: number;
  bookedGross: number;
  platformRevenue: number;
  driverPayable: number;
  completedPlatformRevenue: number;
  completedDriverEarnings: number;
  daily: DailyFinance[];
  rideSplits: Array<{
    id: number;
    fare: number;
    platformShare: number;
    driverEarning: number;
    status: RideStatus;
    reversed: boolean;
    createdAt: string;
    riderName: string | null;
    driverName: string | null;
  }>;
};

export type AdminAccount = {
  id: string;
  email: string;
  role: string;
  fullName: string;
  phone: string;
  suspended: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

export async function getDriverDashboard(userId: string) {
  const client = requireSupabase();
  const [driverResult, ridesResult, financesResult] = await Promise.all([
    client.from("drivers").select("*").eq("user_id", userId).single(),
    client.from("rides")
      .select(rideSelection)
      .eq("driver_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    client.rpc("driver_financial_summary"),
  ]);
  if (driverResult.error) throw driverResult.error;
  if (ridesResult.error) throw ridesResult.error;
  if (financesResult.error) throw financesResult.error;
  return {
    driver: driverResult.data as Driver,
    rides: (ridesResult.data as RideRow[]).map(mapRide),
    finances: financesResult.data as DriverFinances,
  };
}

export async function setDriverStatus(status: "ONLINE" | "OFFLINE") {
  const { error } = await requireSupabase().rpc("set_driver_status", { new_status: status });
  if (error) throw error;
}

export async function updateDriverRide(id: number, driverId: string, status: RideStatus) {
  const client = requireSupabase();
  if (status === "DECLINED") {
    const { error } = await client.rpc("decline_ride", { ride_id: id });
    if (error) throw error;
    return;
  }
  const { error } = await client.from("rides")
    .update({ status })
    .eq("id", id)
    .eq("driver_id", driverId)
    .select("id")
    .single();
  if (error) throw error;
}

export async function getAdminDashboard() {
  const client = requireSupabase();
  const [ridesResult, driversResult, financesResult, settingsResult] = await Promise.all([
    client.from("rides")
      .select(rideSelection)
      .order("created_at", { ascending: false })
      .limit(100),
    client.from("drivers").select("*").order("created_at", { ascending: false }),
    client.rpc("admin_financial_summary"),
    client.from("platform_settings").select("platform_fee_amount").eq("id", "default").single(),
  ]);
  if (ridesResult.error) throw ridesResult.error;
  if (driversResult.error) throw driversResult.error;
  if (financesResult.error) throw financesResult.error;
  if (settingsResult.error) throw settingsResult.error;
  const rides = (ridesResult.data as RideRow[]).map(mapRide);
  return {
    requests: rides,
    drivers: driversResult.data as Driver[],
    newCount: rides.filter((ride) => ride.status === "NEW").length,
    pendingDrivers: (driversResult.data as Driver[]).filter((driver) => driver.status === "PENDING").length,
    finances: financesResult.data as AdminFinances,
    platformFee: settingsResult.data.platform_fee_amount as number,
  };
}

export async function getAdminAccounts(): Promise<AdminAccount[]> {
  const { data, error } = await requireSupabase().functions.invoke("admin-users", { body: { action: "list" } });
  if (error) throw error;
  return data as AdminAccount[];
}

export async function updateAdminAccount(userId: string, action: "suspend" | "restore") {
  const { error } = await requireSupabase().functions.invoke("admin-users", { body: { action, userId } });
  if (error) throw error;
}

export async function updatePlatformFee(platformFee: number) {
  const { error } = await requireSupabase().from("platform_settings")
    .update({ platform_fee_amount: platformFee })
    .eq("id", "default")
    .select("platform_fee_amount")
    .single();
  if (error) throw error;
}

export async function adminUpdateRide(id: number, changes: { status?: RideStatus; driver_id?: string | null }) {
  const { error } = await requireSupabase().from("rides").update(changes).eq("id", id).select("id").single();
  if (error) throw error;
}

export async function adminUpdateDriver(userId: string, status: string) {
  const { error } = await requireSupabase()
    .from("drivers")
    .update({ status })
    .eq("user_id", userId)
    .select("user_id")
    .single();
  if (error) throw error;
}

export function watchRideChanges(onChange: () => void) {
  const client = requireSupabase();
  const channel = client.channel(`ride-updates-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

export function money(value: number): string {
  return `R${Math.round(value)}`;
}

export function formatStatus(status: RideStatus): string {
  return ({
    NEW: "Finding your driver",
    ACCEPTED: "Driver confirmed",
    STARTED: "On the way",
    ARRIVED: "Your driver has arrived",
    COMPLETED: "Ride complete",
    CANCELLED: "Ride cancelled",
    DECLINED: "No driver available",
  })[status];
}
