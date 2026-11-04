import { useStore } from '../state/store'

export interface Slice {
  key: string
  label: string
  value: number
  color: string
  /** Hatched fill, so grouped slices stand apart without relying on color alone. */
  hatched?: boolean
}

// Brand chart colors: Purple, Pink, Plum, Muted plum.
export const CHART = { purple: '#6C4CF5', pink: '#FF7EB3', plum: '#1E1846', muted: '#68617D', track: '#E9E3FF' }

export function Donut({ slices, size = 220, thickness = 34, center, sensitive }: { slices: Slice[]; size?: number; thickness?: number; center: React.ReactNode; sensitive?: boolean }) {
  const { hidden: hideOn } = useStore()
  const hidden = hideOn && !!sensitive
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 3 : 0
  let offset = 0
  const label = hidden
    ? 'Spending chart. Amounts are hidden.'
    : `Spending chart. ${slices.map((s) => `${s.label} ${s.value.toFixed(2)} dollars`).join(', ')}.`

  return (
    <div className="donut-wrap" style={{ width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={CHART.muted} />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2.5" />
          </pattern>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART.track} strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s) => {
            if (s.value <= 0) return null
            const len = (s.value / total) * c
            const dash = Math.max(0, len - gap)
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.hatched ? 'url(#hatch)' : s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            )
            offset += len
            return el
          })}
      </svg>
      <div className="donut-center">{center}</div>
    </div>
  )
}
