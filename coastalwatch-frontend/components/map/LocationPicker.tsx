'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, MapPin, Navigation } from 'lucide-react'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

interface LocationPickerProps {
  latitude: number | null
  longitude: number | null
  onChange: (lat: number, lng: number) => void
}

export default function LocationPicker({ latitude, longitude, onChange }: LocationPickerProps) {
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [gpsError, setGpsError] = useState('')
  const manuallyPicked = useRef(false)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const captureGPS = useCallback((automatic = false) => {
    if (!navigator.geolocation) {
      setGpsStatus('error')
      setGpsError('Location services are unavailable in this browser. You can still pin the location on the map.')
      return
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setGpsStatus('error')
      setGpsError('GPS requires a secure HTTPS connection. You can still pin the location on the map.')
      return
    }

    setGpsStatus('loading')
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      position => {
        if (automatic && manuallyPicked.current) return
        onChangeRef.current(position.coords.latitude, position.coords.longitude)
        setGpsStatus('ready')
      },
      error => {
        if (automatic && manuallyPicked.current) return
        setGpsStatus('error')
        if (error.code === error.PERMISSION_DENIED) {
          setGpsError('Location permission is blocked. Allow location access in your browser settings, then try again or pin the map manually.')
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGpsError('Your device could not determine its location. Turn on device location or pin the map manually.')
        } else {
          setGpsError('GPS took too long to respond. Try again outdoors or pin the map manually.')
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => {
    if (latitude == null && longitude == null) {
      captureGPS(true)
    } else {
      setGpsStatus('ready')
    }
  }, [captureGPS, latitude, longitude])

  function handleMapClick(lat: number, lng: number) {
    manuallyPicked.current = true
    onChange(lat, lng)
    setGpsStatus('ready')
    setGpsError('')
  }

  function handleUseCurrentLocation() {
    manuallyPicked.current = false
    captureGPS()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4 text-primary-600 shrink-0" />
          {latitude != null && longitude != null
            ? <span className="font-medium text-primary-700">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
            : <span className="text-gray-400">{gpsStatus === 'loading' ? 'Finding your location…' : 'Location not set'}</span>
          }
        </div>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={gpsStatus === 'loading'}
          className="btn-secondary min-h-10 px-3 text-xs"
        >
          {gpsStatus === 'loading'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding GPS…</>
            : <><Navigation className="w-3.5 h-3.5" /> Use my location</>}
        </button>
      </div>
      {gpsError && <p role="status" className="text-xs text-amber-700">{gpsError}</p>}
      <div className="rounded-xl overflow-hidden border border-gray-200">
        <MapView
          height="300px"
          onMapClick={handleMapClick}
          marker={latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null}
        />
      </div>
      {latitude != null && longitude != null && (
        <p className="text-xs text-green-600 font-medium">Location captured or pinned. Tap the map to adjust it.</p>
      )}
      {latitude == null && longitude == null && (
        <p className="text-xs text-gray-400">GPS fills this automatically when allowed. Tap the map to set or adjust it manually.</p>
      )}
    </div>
  )
}
