'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

interface LocationPickerProps {
  latitude: number | null
  longitude: number | null
  onChange: (lat: number, lng: number) => void
}

export default function LocationPicker({ latitude, longitude, onChange }: LocationPickerProps) {
  const [picked, setPicked] = useState(false)

  function handleMapClick(lat: number, lng: number) {
    onChange(lat, lng)
    setPicked(true)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <MapPin className="w-4 h-4 text-primary-600" />
        {latitude && longitude
          ? <span className="font-medium text-primary-700">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
          : <span className="text-gray-400">Click on the map to set location</span>
        }
      </div>
      <div className="rounded-xl overflow-hidden border border-gray-200">
        <MapView
          height="300px"
          onMapClick={handleMapClick}
          marker={latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null}
        />
      </div>
      {!picked && latitude == null && (
        <p className="text-xs text-gray-400">Tap anywhere on the map to drop a pin at the exact location</p>
      )}
      {latitude != null && longitude != null && (
        <p className="text-xs text-green-600 font-medium">Location pinned on the map. Tap the map to adjust it.</p>
      )}
    </div>
  )
}
