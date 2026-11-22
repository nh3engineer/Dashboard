const eur0 = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const dateFmt = new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('de-AT', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export const eur = (n: number) => eur0.format(n);
/** Ab 1 Mio. gekürzt (€ 1,3 Mio.), sonst voll ausgeschrieben. */
export const eurCompact = (n: number) =>
  Math.abs(n) >= 1e6 ? `€ ${(n / 1e6).toLocaleString('de-AT', { maximumFractionDigits: 2 })} Mio.` : eur0.format(n);
/** Wie eur(), nur ohne Währungszeichen – gleiche Tausendertrennung für Achsen. */
export const num = (n: number) => eur0.format(n).replace(/[€\s]/g, '');
export const pct = (x: number) => `${Math.round(x * 100)} %`;
export const date = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso + 'T00:00:00Z')) : '–');
export const month = (day: number) => monthFmt.format(new Date(day * 86400000));
export const index = (x: number | null) => (x === null ? '–' : x.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const signedEur = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${eur0.format(Math.abs(n))}`;
export const days = (n: number) => (n === 0 ? 'im Plan' : `${n > 0 ? '+' : '−'}${Math.abs(n)} ${Math.abs(n) === 1 ? 'Tag' : 'Tage'}`);
