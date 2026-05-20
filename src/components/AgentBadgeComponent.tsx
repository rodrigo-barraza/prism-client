"use client";

import { useRef, useCallback, useMemo, useEffect } from "react";
import { renderAgentIcon } from "./AgentPickerComponent";
import ThreeCanvasComponent from "./ThreeCanvasComponent";
import styles from "./AgentBadgeComponent.module.css";

// -- Agent gradient lookup ------------------------------------------
const AGENT_GRADIENTS: Record<string, string[]> = {
  NONE: ["#64748b", "#94a3b8"],
  CODING: ["#6366f1", "#818cf8"],
  OMNI: ["#b91c1c", "#dc2626"],
  LUPOS: ["#ef4444", "#f97316"],
  STICKERS: ["#10b981", "#34d399"],
  DIGEST: ["#f59e0b", "#ef4444"],
  LIGHTS: ["#eab308", "#f59e0b"],
  OOG: ["#78716c", "#a8a29e"],
};
const FALLBACK_GRADIENT = ["#8b5cf6", "#06b6d4"];

function resolveGradient(agent) {
  if (agent?.color) return [agent.color, agent.color];
  return (AGENT_GRADIENTS as Record<string, unknown>)[agent?.id] || FALLBACK_GRADIENT;
}

// -- Canvas texture helpers -----------------------------------------

/** Draw a rounded-rect gradient fill on a canvas context. */
function drawGradientBase(context: CanvasRenderingContext2D, s: number, gradient: unknown) {
  const r = s * 0.16;
  context.beginPath();
  context.roundRect(0, 0, s, s, r);
  context.closePath();
  const g = context.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, gradient[0]);
  g.addColorStop(1, gradient[1]);
  context.fillStyle = g;
  context.fill();
}

/** Load an SVG string as an Image (returns a Promise). */
function loadSvgImage(svgMarkup: unknown) {
  return new Promise((resolve: unknown) => {
    const image = new Image();
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

// -- Static Coin Sub-component (flat, matches SVG badge) ------------

const TEX_SIZE = 256;

/**
 * CoinStatic — renders the agent badge as a flat, unlit plane in Three.js
 * so it looks identical to the SVG badge but lives in a WebGL canvas.
 * Uses MeshBasicMaterial (no lighting needed) and pauses after the first
 * painted frame to avoid burning GPU on a static element.
 */
function CoinStatic({ agent, size }: unknown) {
  const meshRef = useRef<unknown>(null);
  const texRef = useRef<unknown>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iconRef = useRef<HTMLCanvasElement | null>(null);
  const hasPaintedRef = useRef<boolean>(false);
  const gradient = useMemo(() => resolveGradient(agent), [agent]);

  // -- Three.js scene setup — single flat plane --
  const handleSetup = useCallback(
    ({ scene, camera, THREE }: unknown) => {
      // Orthographic-style: push camera back, use tight FOV so plane fills view
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);

      // No lights needed — MeshBasicMaterial is unlit

      // Build the texture canvas with gradient + rounded corners
      const texCanvas = document.createElement("canvas");
      texCanvas.width = TEX_SIZE;
      texCanvas.height = TEX_SIZE;
      const context = texCanvas.getContext("2d");
      drawGradientBase(context, TEX_SIZE, gradient);
      canvasRef.current = texCanvas;

      const tex = new THREE.CanvasTexture(texCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      texRef.current = tex;

      // Flat plane — no cylinder, no depth, no metalness
      const geo = new THREE.PlaneGeometry(1.2, 1.2);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      meshRef.current = mesh;
      scene.add(mesh);

      hasPaintedRef.current = false;
    },
    [gradient],
  );

  // -- Capture icon from the hidden rendered element (SVG or IMG) --
  useEffect(() => {
    if (!iconRef.current) return;

    const raf = requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      const iconSz = TEX_SIZE * 0.55;
      const off = (TEX_SIZE - iconSz) / 2;
      const context = (canvasRef.current as HTMLCanvasElement).getContext("2d");

      // Try <img> first (image-based agent logos like OMNI)
      const img = (iconRef.current as HTMLElement).querySelector("img");
      if (img) {
        const drawImg = () => {
          context.drawImage(img, off, off, iconSz, iconSz);
          if (texRef.current) (texRef.current as {needsUpdate: boolean}).needsUpdate = true;
        };
        if (img.complete && img.naturalWidth > 0) {
          drawImg();
        } else {
          img.onload = drawImg;
        }
        return;
      }

      // Fall back to SVG icons (Lucide components)
      const svg = (iconRef.current as HTMLElement).querySelector("svg");
      if (!svg) return;

      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const markup = svg.outerHTML.replace(/currentColor/g, "#ffffff");

      loadSvgImage(markup).then((image: unknown) => {
        if (!image || !canvasRef.current) return;
        context.drawImage(image, off, off, iconSz, iconSz);
        if (texRef.current) (texRef.current as {needsUpdate: boolean}).needsUpdate = true;
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [agent]);

  // Continuous Y-axis rotation — smooth coin-flip loop
  const handleTick = useCallback(({ elapsed }: unknown) => {
    if (!meshRef.current) return;
    (meshRef.current as {rotation: {x: number; y: number; z: number}}).rotation.y = elapsed * 1.2;
  }, []);

  return (
    <>
      {/* Hidden icon render — React tree handles this naturally */}
      <span ref={iconRef} className={styles.hiddenIcon}>
        {renderAgentIcon(agent, Math.round(TEX_SIZE * 0.5))}
      </span>
      <ThreeCanvasComponent
        onSetup={handleSetup}
        onTick={handleTick}
        cameraFov={5}
        cameraPosition={[0, 0, 20]}
        alpha
        antialias
        toneMapping="None"
        className={styles.coinCanvas}
        style={{ width: size, height: size }}
      />
    </>
  );
}

// -- Main Component -------------------------------------------------

/**
 * AgentBadgeComponent — Reusable rounded-square icon badge for an agent persona.
 */
export default function AgentBadgeComponent({
  agent,
  size = 22,
  iconSize = 13,
  animation = false,
  className = "",
}: unknown) {
  const agentId = agent?.id || "";

  if (animation) {
    return (
      <span className={`${styles.coinWrap} ${className}`}>
        {/* Key by agent ID so Three.js instance fully remounts on agent switch */}
        <CoinStatic key={agentId} agent={agent} size={size} />
      </span>
    );
  }

  const outerStyle = { width: size, height: size };

  const gradientStyle = agent?.color
    ? {
        background: `linear-gradient(135deg, ${agent.color} 0%, color-mix(in srgb, ${agent.color} 70%, #fff) 100%)`,
      }
    : undefined;

  return (
    <span
      className={`${styles.badge} ${className}`}
      data-agent={agentId}
      style={outerStyle}
    >
      <span
        className={styles.badgeInner}
        data-agent={agentId}
        style={gradientStyle}
      >
        {renderAgentIcon(agent, iconSize)}
      </span>
    </span>
  );
}
