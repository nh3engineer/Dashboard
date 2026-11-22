import type { Nps } from '../../kpi';
import { ShareBar } from './KpiCard';

/** Verteilung Promotoren (9–10) / Passive (7–8) / Detraktoren (0–6). */
export function NpsBar({ n }: { n: Nps }) {
  return (
    <ShareBar label="Verteilung der Bewertungen" segments={[
      { key: 'promotor', label: 'Promotoren', value: n.promotoren },
      { key: 'passiv', label: 'Passive', value: n.passive },
      { key: 'detraktor', label: 'Detraktoren', value: n.detraktoren },
    ]} />
  );
}
