type Props = { d: string; className?: string; strokeWidth?: number }

// Icône au trait (même jeu d'icônes que l'A3 ERP)
export default function Icon({ d, className = 'w-5 h-5', strokeWidth = 1.8 }: Props) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
