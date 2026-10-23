interface PuzzleTileProps {
  imageUrl: string
  tileIndex: number
  gridSize?: number
}

export function PuzzleTile({ imageUrl, tileIndex, gridSize = 2 }: PuzzleTileProps) {
  const rowIndex = Math.floor(tileIndex / gridSize)
  const colIndex = tileIndex % gridSize
  const bgSizePercent = gridSize * 100
  const divisor = gridSize > 1 ? gridSize - 1 : 1
  const posX = (colIndex / divisor) * 100
  const posY = (rowIndex / divisor) * 100

  return (
    <div className="tile-frame" role="img" aria-label={`Puzzle tile ${tileIndex + 1}`}>
      <div
        className="tile-image"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: `${bgSizePercent}% ${bgSizePercent}%`,
          backgroundPosition: `${posX}% ${posY}%`,
          backgroundRepeat: 'no-repeat',
        }}
      />
      <span className="tile-badge">Piece {tileIndex + 1}</span>
    </div>
  )
}