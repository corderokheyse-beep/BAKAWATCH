'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Upload, X, RefreshCw, Check, ImageIcon, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhotoCaptureProps {
  onPhoto: (file: File) => void
  onPhotos?: (files: File[]) => void
  onClear?: () => void
  preview?: string | null
  multiple?: boolean
  label?: string
  hint?: string
  maxMB?: number
  className?: string
}

type Mode = 'idle' | 'camera' | 'preview'

export default function PhotoCapture({
  onPhoto,
  onPhotos,
  onClear,
  preview,
  multiple = false,
  label = 'Photo',
  hint = 'JPG, PNG, WebP, HEIC — max 10MB',
  maxMB = 10,
  className,
}: PhotoCaptureProps) {
  const [mode, setMode]                 = useState<Mode>(preview ? 'preview' : 'idle')
  const [cameraError, setCameraError]   = useState<string | null>(null)
  const [facingMode, setFacingMode]     = useState<'environment' | 'user'>('environment')
  const [streaming, setStreaming]       = useState(false)
  const [capturing, setCapturing]       = useState(false)

  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  // Sync preview prop → mode
  useEffect(() => {
    setMode(preview ? 'preview' : 'idle')
  }, [preview])

  // Stop camera stream when unmounted or mode changes away from 'camera'
  useEffect(() => {
    if (mode !== 'camera') stopStream()
  }, [mode]) // eslint-disable-line

  useEffect(() => {
    return () => { stopStream() }
  }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStreaming(false)
  }

  const startCamera = useCallback(async (facing: 'environment' | 'user' = facingMode) => {
    setCameraError(null)
    setStreaming(false)
    stopStream()

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not supported on this device or browser.')
      return
    }

    setMode('camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setStreaming(true)
        }
      }
    } catch (err: any) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      setCameraError(
        denied
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not access camera. Try uploading a photo instead.'
      )
    }
  }, [facingMode]) // eslint-disable-line

  const flipCamera = useCallback(async () => {
    const next: 'environment' | 'user' = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    await startCamera(next)
  }, [facingMode, startCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !streaming) return
    setCapturing(true)

    const canvas = document.createElement('canvas')
    canvas.width  = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) { setCapturing(false); return }
    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob(blob => {
      if (!blob) { setCapturing(false); return }
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (file.size > maxMB * 1024 * 1024) {
        setCameraError(`Photo exceeds ${maxMB}MB limit. Try again.`)
        setCapturing(false)
        return
      }
      onPhoto(file)
      stopStream()
      setMode('preview')
      setCapturing(false)
    }, 'image/jpeg', 0.92)
  }, [streaming, maxMB, onPhoto])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const oversizedFile = files.find(file => file.size > maxMB * 1024 * 1024)
    if (oversizedFile) {
      setCameraError(`${oversizedFile.name} exceeds ${maxMB}MB limit.`)
      return
    }
    if (multiple && onPhotos) onPhotos(files)
    else onPhoto(files[0])
    setMode('preview')
    setCameraError(null)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [maxMB, multiple, onPhoto, onPhotos])

  const handleClear = useCallback(() => {
    stopStream()
    setMode('idle')
    setCameraError(null)
    onClear?.()
  }, [onClear])

  // ── IDLE — choice picker ───────────────────────────────────────────────────
  if (mode === 'idle') {
    return (
      <div className={cn('space-y-2', className)}>
        {cameraError && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {cameraError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Take photo */}
          <button
            type="button"
            onClick={() => startCamera()}
            className="flex flex-col items-center justify-center gap-2.5 h-36 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50/50 hover:bg-primary-50 hover:border-primary-400 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary-100 group-hover:bg-primary-200 flex items-center justify-center transition-colors">
              <Camera className="w-6 h-6 text-primary-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-primary-700">Take Photo</p>
              <p className="text-[10px] text-primary-500 mt-0.5">Use camera live</p>
            </div>
          </button>

          {/* Upload from gallery */}
          <label className="flex flex-col items-center justify-center gap-2.5 h-36 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-300 transition-all group cursor-pointer">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
              <Upload className="w-6 h-6 text-gray-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-600">{multiple ? 'Upload Photos' : 'Upload Photo'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">From gallery / files</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple={multiple}
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>

        <p className="text-[10px] text-gray-400 text-center">{hint}</p>
      </div>
    )
  }

  // ── CAMERA — live viewfinder ───────────────────────────────────────────────
  if (mode === 'camera') {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Loading overlay */}
          {!streaming && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center text-white">
                <Camera className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                <p className="text-sm font-semibold">Starting camera…</p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
              <div className="text-center text-white max-w-xs">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                <p className="text-sm font-semibold mb-3">{cameraError}</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-gray-800 text-xs font-bold cursor-pointer hover:bg-gray-100 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  Upload instead
                  <input type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            </div>
          )}

          {/* Top controls */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClear}
              className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
            {streaming && (
              <button
                type="button"
                onClick={flipCamera}
                className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                title="Flip camera"
              >
                <RefreshCw className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Capture + cancel buttons */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleClear}
            className="btn-secondary text-sm px-4"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={capturePhoto}
            disabled={!streaming || capturing}
            className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all',
              streaming && !capturing
                ? 'bg-primary-600 hover:bg-primary-700 hover:scale-105 active:scale-95'
                : 'bg-gray-300 cursor-not-allowed',
            )}
            title="Capture"
          >
            {capturing
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <div className="w-8 h-8 rounded-full bg-white" />}
          </button>

          {/* Upload alternative */}
          <label className="btn-secondary text-sm px-4 cursor-pointer inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            {multiple ? 'Add photos' : 'Upload'}
            <input type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        <p className="text-[10px] text-gray-400 text-center">
          Tap the white button to capture · Flip icon switches front/rear camera
        </p>
      </div>
    )
  }

  // ── PREVIEW ────────────────────────────────────────────────────────────────
  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative rounded-2xl overflow-hidden">
        {preview ? (
          <img src={preview} alt="Captured photo" className="w-full h-52 object-cover" />
        ) : (
          <div className="w-full h-52 bg-gray-100 flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-gray-400" />
          </div>
        )}

        {/* Clear button */}
        <button
          type="button"
          onClick={handleClear}
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-md hover:bg-red-50 transition-colors"
        >
          <X className="w-4 h-4 text-red-500" />
        </button>

        {/* Captured badge */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-green-600/90 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
          <Check className="w-3 h-3" />
          Photo ready
        </div>
      </div>

      {/* Retake / re-upload */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => startCamera()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 transition-colors"
        >
          <Camera className="w-3.5 h-3.5" /> Retake
        </button>
        <label className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> {multiple ? 'Add photos' : 'Upload different'}
          <input type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleFileChange} />
        </label>
      </div>
    </div>
  )
}
