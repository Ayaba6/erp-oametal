export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900 leading-tight">{title}</h1>
        <p className="text-[12.5px] text-gray-500">Écran à construire dans une prochaine étape.</p>
      </div>
      <div className="bg-white border border-gray-300 rounded-[4px] px-4 py-10 text-center text-[12.5px] text-gray-400">
        Bientôt disponible.
      </div>
    </div>
  )
}
