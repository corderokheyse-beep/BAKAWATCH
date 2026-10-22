/**
 * BakawatchLogo — renders the BakaWatch brand logo.
 * Uses the PNG asset at /images/bakawatch-logo.png.
 *
 * Props:
 *   size      — width/height in px (default 40)
 *   className — extra Tailwind classes on the wrapper
 *   showText  — show the "BAKAWATCH" wordmark below (default false)
 *   textColor — Tailwind text-color class for the wordmark
 */

import Image from 'next/image'

interface Props {
  size?: number
  className?: string
  showText?: boolean
  textColor?: string
}

export default function BakawatchLogo({
  size = 40,
  className = '',
  showText = false,
  textColor = 'text-white',
}: Props) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <Image
        src="/images/bakawatch-logo.png"
        alt="BAKAWATCH logo — mangrove monitoring system"
        width={size}
        height={size}
        priority
        className="object-contain"
        style={{ width: size, height: size }}
      />

      {showText && (
        <span className={`font-black tracking-widest text-xs uppercase ${textColor}`}>
          BAKAWATCH
        </span>
      )}
    </div>
  )
}
