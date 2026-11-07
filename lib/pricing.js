export function zoneOf(place) {
  const value = place.toLowerCase();
  if (/hospital|hosp\b/.test(value)) return "HOSPITAL";
  if (/intabazwe|phomolong|42nd|42 ?hill|forty.?second/.test(value)) return "INTABAZWE";
  if (/tshiame|checkers|qwa ?qwa|phuthaditjhaba|mall|plaza|shopping/.test(value)) return "CENTRES";
  if (/\btown\b|cbd/.test(value)) return "TOWN";
  if (/cent(er|re)/.test(value)) return "CENTRES";
  if (/taxi rank|\brank\b|harrismith|warden/.test(value)) return "TOWN";
  return "INTABAZWE";
}

function isNight(now) {
  const southAfricanTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const hour = southAfricanTime.getUTCHours();
  const minute = southAfricanTime.getUTCMinutes();
  return hour >= 20 || hour < 5 || (hour === 5 && minute === 0);
}

export function quote(from, to, now = new Date()) {
  const fromZone = zoneOf(from);
  const toZone = zoneOf(to);
  let base = 70;
  if ((fromZone === "INTABAZWE" && toZone === "TOWN") || (toZone === "INTABAZWE" && fromZone === "TOWN")) base = 110;
  else if ((fromZone === "INTABAZWE" && ["CENTRES", "HOSPITAL"].includes(toZone)) || (toZone === "INTABAZWE" && ["CENTRES", "HOSPITAL"].includes(fromZone))) base = 130;
  const night = isNight(now) ? 50 : 0;
  return { fromZone, toZone, base, night, total: base + night };
}
