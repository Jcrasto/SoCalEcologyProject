export default function PhotoGallery({ photos, loading, speciesName, inatTaxonId }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-oak-400">
        <div className="text-center">
          <div className="text-3xl mb-2 animate-spin">🌀</div>
          <p className="text-sm">Loading photos...</p>
        </div>
      </div>
    )
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="text-center py-12 text-oak-400">
        <div className="text-5xl mb-3">📷</div>
        <p className="text-sm font-medium">No photos loaded yet</p>
        <p className="text-xs mt-1">
          Run <code className="bg-oak-100 px-1 rounded">python scripts/fetch-data.py</code> to fetch
          photos from iNaturalist
        </p>
        {inatTaxonId && (
          <a
            href={`https://www.inaturalist.org/taxa/${inatTaxonId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
          >
            View on iNaturalist →
          </a>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {photos.map((photo, i) => (
          <div
            key={photo.img_id || i}
            className="group relative rounded-lg overflow-hidden bg-oak-100 aspect-square"
          >
            <img
              src={photo.url}
              alt={`${speciesName} photo ${i + 1}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-white text-xs">
                {photo.photographer && `© ${photo.photographer}`}
              </p>
              {photo.license && (
                <p className="text-white/70 text-xs">
                  {photo.license} via {photo.source}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-oak-400">
        Photos from iNaturalist — per-photo licenses as shown. Attribution: © photographer name,
        license, via iNaturalist.
      </p>
    </div>
  )
}
