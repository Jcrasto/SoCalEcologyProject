export default function SpeciesCard({ species, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm border border-oak-100 overflow-hidden cursor-pointer hover:shadow-md hover:border-oak-300 transition-all group"
    >
      {/* Color hero band */}
      <div
        className="h-24 flex items-center justify-center text-5xl"
        style={{ backgroundColor: species.heroColor + '33' }}
      >
        <span style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>🌳</span>
      </div>

      <div className="p-4">
        <h3 className="font-bold text-oak-900 text-base leading-tight group-hover:text-oak-600 transition-colors">
          {species.commonName}
        </h3>
        <p className="text-oak-500 text-xs italic mb-2">{species.scientificName}</p>

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {species.usdaSymbol && (
            <span className="px-1.5 py-0.5 bg-oak-100 text-oak-700 text-xs rounded font-mono">
              {species.usdaSymbol}
            </span>
          )}
          {species.cnpsRank && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
              CNPS Rare
            </span>
          )}
          {species.conservationStatus && species.conservationStatus.includes('Vulnerable') && (
            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
              Vulnerable
            </span>
          )}
        </div>

        <p className="text-oak-600 text-xs line-clamp-2 leading-relaxed">{species.habitat}</p>
      </div>
    </div>
  )
}
