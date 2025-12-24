import * as React from 'react'

import { Card } from '@/components/ui/card'
import PrivateAssetCard from '@/components/PrivateAssetCard'
import { DRAG_ACTIVATE_THRESHOLD_PX } from '@/lib/constants'
import { createMockPrivateCashVouchers, type PrivateCashVoucherTile } from '@/lib/voucher'

type PrivateAssetsGridProps = {
  vouchers?: PrivateCashVoucherTile[]
  selectedNoteId?: string | null
  onSelectNote?: (id: string) => void
  onViewDetails?: (id: string) => void
  onDragStart?: (noteId: string) => void
  onDragEnd?: () => void
}

export default function PrivateAssetsGrid({ vouchers, selectedNoteId, onSelectNote, onViewDetails, onDragStart, onDragEnd }: PrivateAssetsGridProps) {
  const initialTiles = React.useMemo<PrivateCashVoucherTile[]>(() => vouchers ?? createMockPrivateCashVouchers(), [vouchers])

  const [tiles, setTiles] = React.useState(initialTiles)

  React.useEffect(() => {
    if (vouchers) {
      setTiles(vouchers)
    }
  }, [vouchers])
  const dragIndex = React.useRef<number | null>(null)
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [mouseDown, setMouseDown] = React.useState(false)
  const dragStartPos = React.useRef<{x: number, y: number} | null>(null)
  const [dragGhostPos, setDragGhostPos] = React.useState<{x: number, y: number} | null>(null)

  const cleanupDrag = React.useCallback(() => {
    document.body.style.userSelect = ''
    setMouseDown(false)
    setIsDragging(false)
    dragIndex.current = null
    setHoverIndex(null)
    dragStartPos.current = null
    setDragGhostPos(null)
    onDragEnd?.()
  }, [onDragEnd])

  const handleMouseDown = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setMouseDown(true)
    dragStartPos.current = {x: e.clientX, y: e.clientY}
    dragIndex.current = index
  }

  const handleMouseMove = (index: number) => (e: React.MouseEvent) => {
    if (mouseDown && dragIndex.current !== null && dragStartPos.current) {
      e.preventDefault()
      const dx = Math.abs(e.clientX - dragStartPos.current.x)
      const dy = Math.abs(e.clientY - dragStartPos.current.y)
      
      if (!isDragging && (dx > DRAG_ACTIVATE_THRESHOLD_PX || dy > DRAG_ACTIVATE_THRESHOLD_PX)) {
        setIsDragging(true)
        document.body.style.userSelect = 'none'
        onDragStart?.(tiles[dragIndex.current].id)
      }
      
      if (isDragging) {
        setDragGhostPos({x: e.clientX, y: e.clientY})
      }
      
      if (isDragging && index !== dragIndex.current) {
        setHoverIndex(index)
      }
    }
  }

  const handleMouseUp = (index: number) => () => {
    if (isDragging && dragIndex.current !== null && index !== dragIndex.current) {
      moveTile(dragIndex.current, index)
    }
    cleanupDrag()
  }

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (mouseDown && isDragging && dragIndex.current !== null) {
      e.preventDefault()
      setDragGhostPos({x: e.clientX, y: e.clientY})
      
      const target = e.target as HTMLElement
      if (target.classList.contains('drop-container')) {
        setHoverIndex(tiles.length)
      }
    }
  }

  const handleContainerMouseUp = (e: React.MouseEvent) => {
    if (isDragging && dragIndex.current !== null) {
      const target = e.target as HTMLElement
      if (target.classList.contains('drop-container')) {
        moveTile(dragIndex.current, tiles.length)
      }
    }
    cleanupDrag()
  }
  React.useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (mouseDown && isDragging && dragIndex.current !== null) {
        setDragGhostPos({x: e.clientX, y: e.clientY})
      }
    }

    const handleGlobalMouseUp = () => {
      if (mouseDown || isDragging) {
        cleanupDrag()
      }
    }

    if (mouseDown || isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove)
      window.addEventListener('mouseup', handleGlobalMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [mouseDown, isDragging, dragIndex, tiles, cleanupDrag])

  const moveTile = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    setTiles((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(Math.min(to, next.length), 0, item)
      return next
    })
  }

  const handleClick = (id: string) => {
    if (!isDragging) {
      onSelectNote?.(id)
    }
  }

  return (
    <>
      {isDragging && dragIndex.current !== null && dragGhostPos && (
        <div
          className="fixed pointer-events-none z-[10000] opacity-80 scale-95 transition-transform duration-100"
          style={{
            left: dragGhostPos.x - 93,
            top: dragGhostPos.y - 79,
          }}
        >
          <PrivateAssetCard
            isFull
            valueUsd={tiles[dragIndex.current].amount}
            txSignature={tiles[dragIndex.current].txSignature}
            createdAt={tiles[dragIndex.current].createdAt}
          />
        </div>
      )}
      
      <Card variant="darkSolidGrey" className="py-4 px-4">
        <div 
          className="drop-container flex flex-wrap gap-4 min-h-[200px] content-start"
          onMouseMove={handleContainerMouseMove}
          onMouseUp={handleContainerMouseUp}
        >
        {tiles.map((t, index) => {
          const isSelected = selectedNoteId === t.id
          return (
            <div
              key={t.id}
              onMouseDown={handleMouseDown(index)}
              onMouseMove={handleMouseMove(index)}
              onMouseUp={handleMouseUp(index)}
              onClick={() => handleClick(t.id)}
              className="relative cursor-grab active:cursor-grabbing select-none"
              style={{ opacity: isDragging && dragIndex.current === index ? 0.5 : 1 }}
            >
              <PrivateAssetCard
                isFull
                valueUsd={t.amount}
                txSignature={t.txSignature}
                createdAt={t.createdAt}
                onClickDetails={() => onViewDetails?.(t.id)}
              />
              {hoverIndex === index ? (
                <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-2 ring-[var(--corange-500)] shadow-[0_0_8px_0_rgba(251,146,60,0.3)]" />
              ) : null}
              {isSelected ? (
                <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-2 ring-[var(--brand-green)] shadow-[0_0_12px_0_#52C97D60]" />
              ) : null}
            </div>
          )
        })}
        {tiles.length === 0 ? (
          <div className="w-full rounded-xl border border-dashed border-white/20 bg-white/0 p-6 text-center text-xs text-[var(--text-tertiary)]">
            Select a folder that contains voucher files to see them displayed here.
          </div>
        ) : null}
      </div>
    </Card>
    </>
  )
}


