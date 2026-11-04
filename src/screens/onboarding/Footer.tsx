import type { ReactNode } from 'react'

/**
 * The main button is fixed to the same spot at the bottom of every onboarding step.
 * A secondary action sits above it, so the main button never moves.
 * The spacer keeps page content from hiding behind the footer.
 */
export function Footer({ label, onClick, disabled, secondary }: { label: string; onClick: () => void; disabled?: boolean; secondary?: ReactNode }) {
  return (
    <>
      <div className={`ob-spacer ${secondary ? 'tall' : ''}`} aria-hidden />
      <div className="ob-footer">
        {secondary}
        <button type="button" className="btn primary block" onClick={onClick} disabled={disabled}>
          {label}
        </button>
      </div>
    </>
  )
}

