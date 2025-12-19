import * as React from 'react'
import { Clock3 } from 'lucide-react'

import cubeFilled from '@/assets/zera-cube.svg'
import cubeEmpty from '@/assets/zera-cube-empty.svg'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type PrivateAssetCardProps = {
  isFull: boolean
  valueUsd: number
  txSignature: string
  createdAt: string | Date
  className?: string
}

function formatUsdCompact(value: number): { whole: string; fraction: string } {
  const fixed = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const [whole, fraction = '00'] = fixed.split('.')
  return { whole, fraction }
}

function formatVoucherAge(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '<1m'

  if (minutes < 60) {
    return `${Math.round(minutes)}m`
  }

  const hours = minutes / 60
  if (hours < 24) {
    return `${Math.round(hours)}h`
  }

  const days = hours / 24
  if (days < 7) {
    return `${Math.round(days)}d`
  }

  const weeks = days / 7
  if (weeks < 4) {
    return `${Math.round(weeks)}w`
  }

  const months = days / 30
  if (months < 12) {
    return `${Math.round(months)}m`
  }

  const years = days / 365
  return `${Math.round(years)}y`
}

export default function PrivateAssetCard({
  isFull,
  valueUsd,
  txSignature,
  createdAt,
  className,
}: PrivateAssetCardProps) {
  const createdDate = React.useMemo(() => new Date(createdAt), [createdAt])
  const ageMinutes = React.useMemo(() => {
    const now = Date.now()
    const createdMs = Number.isFinite(createdDate.getTime()) ? createdDate.getTime() : now
    return Math.max(0, (now - createdMs) / 60_000)
  }, [createdDate])

  // This is a placeholder for potential future use
  const isStale = false
  const { whole, fraction } = formatUsdCompact(valueUsd)

  // Shrink-to-fit for very large numbers
  const valueContainerRef = React.useRef<HTMLDivElement>(null)
  const valueInnerRef = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(1)

  React.useLayoutEffect(() => {
    const container = valueContainerRef.current
    const inner = valueInnerRef.current
    if (!container || !inner) return

    const recalc = () => {
      const available = container.clientWidth
      const content = inner.scrollWidth
      if (available > 0 && content > 0) {
        const next = Math.min(1, available / content)
        setScale(next)
      }
    }

    recalc()
    const obs = new ResizeObserver(recalc)
    obs.observe(container)
    obs.observe(inner)
    return () => obs.disconnect()
  }, [whole, fraction])

  return (
    <div
      className={cn(
        'relative w-[186px] h-[158px] rounded-[18px] bg-[#232222] text-[var(--text-primary)] p-4 flex flex-col',
        className
      )}
    >
      {/* Sync age badge */}
      <div className="absolute left-2 top-2">
        <Badge variant="tx" status="pending" className="px-2 py-1">
          <Clock3 className="mr-1" />
          {formatVoucherAge(ageMinutes)}
        </Badge>
      </div>

      {/* Icon */}
      <div className={cn('mt-1 flex items-center justify-center')}> 
        <img
          src={isFull ? cubeFilled : cubeEmpty}
          alt={isFull ? 'Zera cube (full)' : 'Zera cube (empty)'}
          className={cn('w-16 h-16', isStale && 'opacity-50')}
        />
      </div>

      {/* Value */}
      <div ref={valueContainerRef} className="relative w-full h-8 overflow-hidden">
        <div
          ref={valueInnerRef}
          className={cn('font-pp-machina text-[24px] leading-[32px] tracking-[-0.006em] leading-trim-cap text-center whitespace-nowrap inline-block absolute left-1/2 top-0', isStale && 'opacity-50')}
          style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
        >
          <span className="align-baseline">${whole}</span>
          <span className="align-baseline opacity-70 text-[14px]">.{fraction}</span>
        </div>
      </div>

      {/* Address + chain badge */}
      <div className={cn('mt-auto flex items-center text-[var(--text-primary)]/70', isStale && 'opacity-50')}>
        <span className="font-body font-normal text-[16px] leading-4 tracking-[0] tabular-nums overflow-hidden text-ellipsis whitespace-nowrap">
          {txSignature}
        </span>
      </div>
    </div>
  )
}


