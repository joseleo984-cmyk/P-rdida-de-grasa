// Cálculos puros (sin DOM) para poder probarlos con Node.
(function (root) {
  'use strict';

  const KCAL_PER_KG_FAT = 7700;
  const MIN_KCAL = { male: 1500, female: 1200 };

  // Gasto energético basal (Mifflin-St Jeor).
  function bmr({ sex, weight, height, age }) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return sex === 'female' ? base - 161 : base + 5;
  }

  function tdee(profile, weight) {
    return bmr({ ...profile, weight }) * Number(profile.activity || 1.2);
  }

  // % de grasa por el método de la Marina de EE. UU. (medidas en cm).
  function navyBodyFat({ sex, height, waist, neck, hip }) {
    if (!height || !waist || !neck) return null;
    let bf;
    if (sex === 'female') {
      if (!hip || waist + hip - neck <= 0) return null;
      bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(height)) - 450;
    } else {
      if (waist - neck <= 0) return null;
      bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
    }
    return Number.isFinite(bf) && bf > 2 && bf < 70 ? round(bf, 1) : null;
  }

  // Objetivos diarios de calorías y macros.
  function plan(profile, currentWeight) {
    const weight = currentWeight || profile.startWeight;
    const maintenance = tdee(profile, weight);
    const rate = Number(profile.rate || 0.005);
    const weeklyLossKg = weight * rate;
    const deficit = (weeklyLossKg * KCAL_PER_KG_FAT) / 7;
    const floor = MIN_KCAL[profile.sex] || 1200;
    const kcal = Math.max(floor, Math.round((maintenance - deficit) / 10) * 10);
    const protein = Math.round(weight * 2);
    const fat = Math.max(Math.round((kcal * 0.25) / 9), Math.round(weight * 0.6));
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return {
      bmr: Math.round(bmr({ ...profile, weight })),
      maintenance: Math.round(maintenance),
      deficit: Math.round(maintenance - kcal),
      weeklyLossKg: round(((maintenance - kcal) * 7) / KCAL_PER_KG_FAT, 2),
      kcal, protein, fat, carbs,
      floored: kcal === floor && maintenance - deficit < floor,
    };
  }

  function bmi(weight, heightCm) {
    const m = heightCm / 100;
    return round(weight / (m * m), 1);
  }

  // Media móvil de 7 días sobre los registros con peso (ordenados por fecha).
  function trend(entries, window = 7) {
    const pts = entries.filter((e) => e.weight).sort((a, b) => a.date.localeCompare(b.date));
    return pts.map((p) => {
      const end = toDay(p.date);
      const inWin = pts.filter((q) => { const d = toDay(q.date); return d <= end && d > end - window; });
      const avg = inWin.reduce((s, q) => s + q.weight, 0) / inWin.length;
      return { date: p.date, weight: p.weight, trend: round(avg, 2) };
    });
  }

  // Pendiente (kg/semana) por regresión lineal sobre los últimos `days` días.
  function weeklyRate(entries, days = 21) {
    const pts = entries.filter((e) => e.weight).sort((a, b) => a.date.localeCompare(b.date));
    if (pts.length < 2) return null;
    const last = toDay(pts[pts.length - 1].date);
    const win = pts.filter((p) => toDay(p.date) > last - days);
    if (win.length < 2) return null;
    const xs = win.map((p) => toDay(p.date));
    const ys = win.map((p) => p.weight);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den === 0) return null;
    return round((num / den) * 7, 2);
  }

  function weeksToGoal(currentWeight, goalWeight, weeklyLossKg) {
    if (!weeklyLossKg || weeklyLossKg <= 0) return null;
    const remaining = currentWeight - goalWeight;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / weeklyLossKg);
  }

  // ¿Toca recordar la copia de seguridad? Fechas en ISO local (AAAA-MM-DD).
  // Sí, si hay datos, no está pospuesto y nunca se exportó o hace ≥ `everyDays` días.
  function backupDue(lastBackupISO, snoozeUntilISO, todayISO, hasData, everyDays = 7) {
    if (!hasData) return false;
    const now = toDay(todayISO);
    if (!Number.isFinite(now)) return false;
    const snooze = snoozeUntilISO ? toDay(String(snoozeUntilISO).slice(0, 10)) : NaN;
    if (Number.isFinite(snooze) && now < snooze) return false;
    const last = lastBackupISO ? toDay(String(lastBackupISO).slice(0, 10)) : NaN;
    if (!Number.isFinite(last)) return true;
    return now - last >= everyDays;
  }

  function addDays(iso, n) {
    return new Date((toDay(iso) + n) * 86400000).toISOString().slice(0, 10);
  }

  function toDay(iso) { return Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000); }
  function round(n, d = 0) { const f = 10 ** d; return Math.round(n * f) / f; }

  const api = { bmr, tdee, navyBodyFat, plan, bmi, trend, weeklyRate, weeksToGoal, backupDue, addDays, toDay, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
