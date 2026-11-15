export function todayPktIso() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatTime12h(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function buildTimeSlots(startHour = 11, endHour = 23) {
  const slots = [];
  for (let h = startHour; h <= endHour; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push({ value, label: formatTime12h(value) });
    }
  }
  return slots;
}

export const DINING_TIME_SLOTS = buildTimeSlots(11, 23);

export function formatPakistaniPhone(raw) {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('+92')) return cleaned;
  const digits = cleaned.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) {
    return `+92 ${digits.slice(2)}`;
  }
  if (digits.startsWith('0')) {
    return `+92 ${digits.slice(1)}`;
  }
  return `+92 ${digits}`;
}
