import * as React from 'react'

import { Card } from '@/components/ui/card'
import PrivateAssetCard from '@/components/PrivateAssetCard'

export interface PrivateCashVoucher {
  voucherId: string
  amount: number
  secret: string
  salt: string
  recipient: string
  txSignature: string
  createdAt: string
}

export type PrivateCashVoucherTile = PrivateCashVoucher & { id: string }

export function createMockPrivateCashVouchers(now: number = Date.now()): PrivateCashVoucherTile[] {
  const base: PrivateCashVoucherTile[] = [
      {
        id: '1',
        voucherId: '0x74cccbb7db5be82b7c3d2d36e2cddb25649bd217f384ba003d10a751479b3591',
        amount: 3.25,
        txSignature:
          '14twWK9zNL2F8tUE7aSdtE53xLZ7i9mnYpiudGuwAYBRVQLezrpyhotAGmuf522zuRYjnPE4MV2f8NefBcqynjP',
        secret: '0xcb61b3870d94bef96de22653a3fa20b9e8b386b9446551ca60985ed57c948a7b',
        salt: '0x1daf0ee216260d49503ea68acb2b45949db4f7490d16c2eee4bd0113857ab1a1',
        recipient: '9Y6Aftit2gGPgY6H2DaDH1qnXE6qVhZ6kTpsuRWpuQXy',
        createdAt: new Date(now - 10 * 60_000).toISOString(), // 10 minutes ago
      },
      {
        id: '2',
        voucherId: '0x21d0d9f588921f41286baf2f0fb0c436f6bffafc66e3c0a7f0e17f609e7b0c10',
        amount: 1250.0,
        txSignature:
          '5xwT1k3gN9vZqPtFfX5L4uZf3mC9BrsLw8kT7hQw1rY2uI9pO3dE2sA1cV6bN8mK4tR2eW1qZ3xC5vB7nM',
        secret: '0xd1f74a6b9c2e5f0837a4c9e1b2d3f4a5c6b7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
        salt: '0x9f0e1d2c3b4a59687766554433221100ffeeddccbbaa99887766554433221100',
        recipient: '6uY4FzBzGbs8Xr3nFSevUNFZkJQbM2fzKk8nq9xWwd9H',
        createdAt: new Date(now - 2 * 60 * 60_000).toISOString(), // 2 hours ago
      },
      {
        id: '3',
        voucherId: '0xaabbccddeeff0011223344556677889900aabbccddeeff001122334455667788',
        amount: 42.5,
        txSignature:
          '3pLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuV',
        secret: '0xf0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff',
        salt: '0xbbccddeeff0011223344556677889900aabbccddeeff00112233445566778899',
        recipient: 'E7u4wF6kzL5P3Ge9mP4XofW8Hj1DzCJqY2q1t7RwY4hQ',
        createdAt: new Date(now - 3 * 24 * 60 * 60_000).toISOString(), // 3 days ago
      },
      {
        id: '4',
        voucherId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        amount: 9999.99,
        txSignature:
          '7yZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJ',
        secret: '0x11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff',
        salt: '0xccddeeff0011223344556677889900aabbccddeeff0011223344556677889900',
        recipient: 'HtkX8YaNeC87xYVJcYcN3m5i5x6EPq5yRvCNr4CqpJ2U',
        createdAt: new Date(now - 2 * 7 * 24 * 60 * 60_000).toISOString(), // 2 weeks ago
      },
      {
        id: '5',
        voucherId: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        amount: 0.5,
        txSignature:
          '9qRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaB',
        secret: '0x2233445566778899aabbccddeeff00112233445566778899aabbccddeeff0011',
        salt: '0xddeeff0011223344556677889900aabbccddeeff0011223344556677889900aa',
        recipient: '3YhxU5qHn1E6nKXM3D1GVL2k5sJsbgweAVY9prs4DPWS',
        createdAt: new Date(now - 6 * 30 * 24 * 60 * 60_000).toISOString(), // ~6 months ago
      },
      {
        id: '6',
        voucherId: '0x0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f',
        amount: 250000,
        txSignature:
          '1aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkL',
        secret: '0x33445566778899aabbccddeeff00112233445566778899aabbccddeeff001122',
        salt: '0xeeff0011223344556677889900aabbccddeeff0011223344556677889900aabb',
        recipient: '2YyR9Jt6nMQC8VyZ6Pr8GkG7Anxf7vBYwygJyBEtQtd3',
        createdAt: new Date(now - 2 * 365 * 24 * 60 * 60_000).toISOString(), // ~2 years ago
      },
      {
        id: '7',
        voucherId: '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        amount: 75.0,
        txSignature:
          '2bCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlM',
        secret: '0x445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233',
        salt: '0xff0011223344556677889900aabbccddeeff0011223344556677889900aabbcc',
        recipient: '5zPKX1E9jF1dEYrKj6cGXg4y6xW8qVnQBzF1HwCu8SnT',
        createdAt: new Date(now - 45 * 60_000).toISOString(), // 45 minutes ago
      },
      {
        id: '8',
        voucherId: '0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
        amount: 1.0,
        txSignature:
          '4dEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnO',
        secret: '0x5566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344',
        salt: '0x00113344556677889900aabbccddeeff00112233445566778899aabbccddeeff',
        recipient: '8kM9fYzD3w6XzF4Pg7kNp5Rt2cHs5vuY8f6SgB3Lk1uN',
        createdAt: new Date(now - 20 * 1_000).toISOString(), // <1 minute ago
      },
  ]

  return base
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getMockOfflineBalanceUsd(): number {
  return createMockPrivateCashVouchers().reduce((sum, voucher) => sum + voucher.amount, 0)
}

type PrivateAssetsGridProps = {
  vouchers?: PrivateCashVoucherTile[]
  selectedNoteId?: string | null
  onSelectNote?: (id: string) => void
  onDragStart?: (noteId: string) => void
  onDragEnd?: () => void
}

export default function PrivateAssetsGrid({ vouchers, selectedNoteId, onSelectNote, onDragStart, onDragEnd }: PrivateAssetsGridProps) {
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
      
      if (!isDragging && (dx > 5 || dy > 5)) {
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

  const handleMouseUp = (index: number) => (e: React.MouseEvent) => {
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
          className="drop-container flex flex-wrap gap-4 min-h-[200px]"
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
              />
              {hoverIndex === index ? (
                <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-2 ring-[var(--brand-light-green)]/80 shadow-[0_0_8px_0_#52C97D40]" />
              ) : null}
              {isSelected ? (
                <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-2 ring-[var(--brand-green)] shadow-[0_0_12px_0_#52C97D60]" />
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


