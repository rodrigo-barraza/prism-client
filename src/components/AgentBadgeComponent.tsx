"use client";

import { useRef, useCallback, useMemo, useEffect } from "react";
import { renderAgentIcon } from "./AgentPickerComponent";
import ThreeCanvasComponent from "./ThreeCanvasComponent";
import styles from "./AgentBadgeComponent.module.css";

// -- Agent gradient lookup ------------------------------------------
const AGENT_GRADIENTS = {
  NONE:     ["#64748b", "#94a3b8"],
  CODING:   ["#6366f1", "#818cf8"],
  LUPOS:    ["#ef4444", "#f97316"],
  STICKERS: ["#10b981", "#34d399"],
  DIGEST:   ["#f59e0b", "#ef4444"],
  LIGHTS:   ["#eab308", "#f59e0b"],
  OOG:      ["#78716c", "#a8a29e"],
};
const FALLBACK_GRADIENT = ["#8b5cf6", "#06b6d4"];

function resolveGradient(agent: any) {
  if (agent?.color) return [agent.color, agent.color];
  // @ts-ignore
  return AGENT_GRADIENTS[agent?.id] || FALLBACK_GRADIENT;
}

// -- Canvas texture helpers -----------------------------------------

/** Draw a rounded-rect gradient fill on a canvas context. */
function drawGradientBase(ctx: any, s: any, gradient: any) {
  const r = s * 0.16;
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, r);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, gradient[0]);
  g.addColorStop(1, gradient[1]);
  ctx.fillStyle = g;
  ctx.fill();
}

/** Load an SVG string as an Image (returns a Promise). */
function loadSvgImage(svgMarkup: any) {
  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
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
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
function CoinStatic({ agent: any, size: any }) {
  const meshRef = useRef<any>(null);
  const texRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const iconRef = useRef<any>(null);
  const hasPaintedRef = useRef<any>(false);
  // @ts-ignore
  // @ts-ignore
  const gradient = useMemo<any>(() => resolveGradient(agent), [agent]);

  // -- Three.js scene setup — single flat plane --
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  const handleSetup = useCallback(({ scene: any, camera: any, THREE: any }) => {
    // Orthographic-style: push camera back, use tight FOV so plane fills view
    // @ts-ignore
    camera.position.set(0, 0, 20);
    // @ts-ignore
    camera.lookAt(0, 0, 0);

    // No lights needed — MeshBasicMaterial is unlit

    // Build the texture canvas with gradient + rounded corners
    const texCanvas = document.createElement("canvas");
    texCanvas.width = TEX_SIZE;
    texCanvas.height = TEX_SIZE;
    const ctx = texCanvas.getContext("2d");
    drawGradientBase(ctx, TEX_SIZE, gradient);
    canvasRef.current = texCanvas;

    // @ts-ignore
    const tex = new THREE.CanvasTexture(texCanvas);
    // @ts-ignore
    tex.colorSpace = THREE.SRGBColorSpace;
    texRef.current = tex;

    // Flat plane — no cylinder, no depth, no metalness
    // @ts-ignore
    const geo = new THREE.PlaneGeometry(1.2, 1.2);
    // @ts-ignore
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      // @ts-ignore
      side: THREE.DoubleSide,
    });

    // @ts-ignore
    const mesh = new THREE.Mesh(geo, mat);
    meshRef.current = mesh;
    // @ts-ignore
    scene.add(mesh);

    hasPaintedRef.current = false;
  }, [gradient]);

  // -- Capture SVG icon from the hidden rendered element --
  useEffect(() => {
    if (!iconRef.current) return;

    const raf = requestAnimationFrame(() => {
      const svg = iconRef.current?.querySelector("svg");
      if (!svg || !canvasRef.current) return;

      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const markup = svg.outerHTML.replace(/currentColor/g, "#ffffff");

      loadSvgImage(markup).then((img) => {
        if (!img || !canvasRef.current) return;
        const iconSz = TEX_SIZE * 0.55;
        const off = (TEX_SIZE - iconSz) / 2;

        const ctx = canvasRef.current.getContext("2d");
        ctx.drawImage(img, off, off, iconSz, iconSz);
        if (texRef.current) texRef.current.needsUpdate = true;
      });
    });

    return () => cancelAnimationFrame(raf);
  // @ts-ignore
  }, [agent]);

  // Continuous Y-axis rotation — smooth coin-flip loop
  // @ts-ignore
  const handleTick = useCallback(({ elapsed: any }) => {
    if (!meshRef.current) return;
    // @ts-ignore
    meshRef.current.rotation.y = elapsed * 1.2;
  }, []);

  return (
    <>
      {/* Hidden icon render — React tree handles this naturally */}
      <span ref={iconRef} className={styles.hiddenIcon}>
        {/* @ts-ignore */}
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
        // @ts-ignore
        // @ts-ignore
        style={{ width: size, height: size }}
      />
    </>
  );
}

// -- Main Component -------------------------------------------------

/**
 * AgentBadgeComponent — Reusable rounded-square icon badge for an agent persona.
 *
 * @param {{ id?: string, icon?: string, color?: string }} agent
 * @param {number}  [size=22]         - Outer container size in px
 * @param {number}  [iconSize=13]     - Inner icon size in px
 * @param {boolean} [animation=false] - 3D coin-spin via Three.js
 * @param {string}  [className]
 */
export default function AgentBadgeComponent({
  // @ts-ignore
  agent: any,
  size = 22,
  iconSize = 13,
  animation = false,
  className = "",
}) {
  // @ts-ignore
  const agentId = agent?.id || "";

  if (animation) {
    return (
      <span className={`${styles.coinWrap} ${className}`}>
        {/* Key by agent ID so Three.js instance fully remounts on agent switch */}
        {/* @ts-ignore */}
        <CoinStatic key={agentId} agent={agent} size={size} />
      </span>
    );
  }

  const outerStyle = { width: size, height: size };

  // @ts-ignore
  const gradientStyle = agent?.color
    // @ts-ignore
    // @ts-ignore
    ? { background: `linear-gradient(135deg, ${agent.color} 0%, color-mix(in srgb, ${agent.color} 70%, #fff) 100%)` }
    : undefined;

  return (
    <span
      className={`${styles.badge} ${className}`}
      data-agent={agentId}
      style={outerStyle}
    >
      <span className={styles.badgeInner} data-agent={agentId} style={gradientStyle}>
        {/* @ts-ignore */}
        {renderAgentIcon(agent, iconSize)}
      </span>
    </span>
  );
}
