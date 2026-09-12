// Vendorizado do registry spell.sh (https://spell.sh/r/tilt-card.json).
// Mantido fiel ao source original, exceto pela diretiva "use client" (removida,
// não usamos Next.js) e pela prop `disabled` documentada abaixo.
//
// ⚠️ ARMADILHA CSS: este componente tem `overflow-hidden` e um spotlight
// `absolute inset-0` embutidos. Em CSS, `overflow` != visible força o
// achatamento (`transform-style: flat`) dos filhos, mesmo com `preserve-3d`
// declarado. Portanto, ao usar o TiltCard junto com um flip 3D interno é
// OBRIGATÓRIO passar `className="overflow-visible"` (o tailwind-merge resolve o
// conflito) e `spotlight={false}` — senão o flip vira um espelhamento 2D chapado
// e o verso nunca aparece. Desenhe o brilho dentro de cada face, que é o nível
// folha do 3D e pode ter o seu próprio `overflow-hidden`.
import { useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"

export interface TiltCardProps {
  /** Maximum tilt angle in degrees */
  tiltLimit?: number
  /** Scale factor on hover */
  scale?: number
  /** Perspective distance in pixels */
  perspective?: number
  /** Tilt direction: "gravitate" follows cursor, "evade" tilts away */
  effect?: "gravitate" | "evade"
  /** Show a spotlight that follows the cursor on hover */
  spotlight?: boolean
  /**
   * DESVIO do source original: quando `true`, os handlers de pointer viram
   * no-op e o transform fica travado em repouso. Serve pra respeitar
   * `prefers-reduced-motion` e aparelhos sem hover fino (touch), sem precisar
   * desmontar o componente e perder o layout.
   */
  disabled?: boolean
  /** Additional class name */
  className?: string
  /** Additional inline styles */
  style?: React.CSSProperties
  /** Card content */
  children?: React.ReactNode
}

export function TiltCard({
  tiltLimit = 15,
  scale = 1.05,
  perspective = 1200,
  effect = "evade",
  spotlight = true,
  disabled = false,
  className,
  style,
  children,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const restTransform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`
  const [transform, setTransform] = useState(restTransform)
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 })
  const [isHovered, setIsHovered] = useState(false)

  const dir = effect === "evade" ? -1 : 1

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      const el = cardRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const xRot = (py - 0.5) * (tiltLimit * 2) * dir
      const yRot = (px - 0.5) * -(tiltLimit * 2) * dir
      setTransform(
        `perspective(${perspective}px) rotateX(${xRot}deg) rotateY(${yRot}deg) scale3d(${scale}, ${scale}, ${scale})`
      )
      if (spotlight) {
        setSpotlightPos({ x: px * 100, y: py * 100 })
      }
    },
    [tiltLimit, scale, perspective, dir, spotlight, disabled]
  )

  const handlePointerEnter = useCallback(() => {
    if (disabled) return
    setIsHovered(true)
  }, [disabled])

  const handlePointerLeave = useCallback(() => {
    if (disabled) return
    setTransform(
      `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`
    )
    setIsHovered(false)
  }, [perspective, disabled])

  return (
    <div
      ref={cardRef}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn("will-change-transform relative overflow-hidden", className)}
      style={{
        transform: disabled ? restTransform : transform,
        transition: "transform 0.2s ease-out",
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      {children}
      {spotlight && (
        <div
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          style={{ opacity: isHovered ? 1 : 0, transition: "opacity 0.3s" }}
        >
          <div
            className="absolute w-[200%] h-[200%] rounded-full opacity-100 dark:opacity-50"
            style={{
              left: `${spotlightPos.x}%`,
              top: `${spotlightPos.y}%`,
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 40%)",
            }}
          />
        </div>
      )}
    </div>
  )
}
