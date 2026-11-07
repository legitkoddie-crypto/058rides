export type Zone = "INTABAZWE" | "TOWN" | "CENTRES" | "HOSPITAL";
export function zoneOf(place: string): Zone;
export function quote(from: string, to: string, now?: Date): {
  fromZone: Zone;
  toZone: Zone;
  base: number;
  night: number;
  total: number;
};
