"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  Undo2,
  Eraser,
  Pen,
  Save,
  Minus,
  Square,
  Circle as CircleIcon,
} from "lucide-react";
import styles from "./DrawingCanvasComponent.module.css";

// -- Type Definitions ------------------------------------------

interface DrawingCanvasProps {
  backgroundImageSourceUrl?: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

interface Point2D {
  x: number;
  y: number;
}

interface PenStroke {
  tool: "pen" | "eraser";
  color: string;
  width: number;
  eraser: boolean;
  points: Point2D[];
}

interface ShapeStroke {
  tool: "line" | "rect" | "circle";
  color: string;
  width: number;
  eraser: false;
  start: Point2D;
  end: Point2D;
}

type Stroke = PenStroke | ShapeStroke;

type CanvasPointerEvent =
  | ReactMouseEvent<HTMLCanvasElement>
  | ReactTouchEvent<HTMLCanvasElement>;

// -- Constants -------------------------------------------------

const COLORS = [
  { value: "#000000", label: "Black" },
  { value: "#ef4444", label: "Red" },
  { value: "#facc15", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#38bdf8", label: "Cyan" },
  { value: "#ffffff", label: "White" },
  { value: "#a855f7", label: "Purple" },
];

const SIZES = [
  { label: "S", width: 2, dot: 4 },
  { label: "M", width: 5, dot: 8 },
  { label: "L", width: 12, dot: 12 },
];

const TOOLS = [
  { id: "pen", label: "Pen", icon: Pen },
  { id: "line", label: "Line", icon: Minus },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "circle", label: "Circle", icon: CircleIcon },
  { id: "eraser", label: "Eraser", icon: Eraser },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

const CANVAS_W = 800;
const CANVAS_H = 600;

/**
 * Full-screen drawing canvas modal.
 * - Blank canvas: no `src` → white canvas at CANVAS_W × CANVAS_H
 * - Edit mode: `src` provided → loads image as background
 *
 * Props:
 *   src?         – optional data URL / image URL for editing
 *   onSave(url)  – called with PNG data URL on save
 *   onClose()    – close without saving
 */
export default function DrawingCanvas({
  backgroundImageSourceUrl,
  onSave,
  onClose,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [tool, setTool] = useState<ToolId>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [sizeIndex, setSizeIndex] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: CANVAS_W, height: CANVAS_H });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [bgReady, setBgReady] = useState(!backgroundImageSourceUrl);

  // Compute fitted display dimensions from canvas size + viewport
  useEffect(() => {
    const fit = () => {
      const maxW = window.innerWidth * 0.85;
      const maxH = window.innerHeight - 220; // room for toolbar + bottom bar
      const ratio = canvasSize.width / canvasSize.height;
      let fitWidth = Math.min(canvasSize.width, maxW);
      let fitHeight = fitWidth / ratio;
      if (fitHeight > maxH) {
        fitHeight = maxH;
        fitWidth = fitHeight * ratio;
      }
      setDisplaySize({ width: Math.round(fitWidth), height: Math.round(fitHeight) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [canvasSize]);

  // Load background image (edit mode)
  useEffect(() => {
    if (!backgroundImageSourceUrl) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      setCanvasSize({ width: image.naturalWidth, height: image.naturalHeight });
      setBgReady(true);

      // Draw background onto the bg canvas
      requestAnimationFrame(() => {
        const bgCanvas = bgCanvasRef.current;
        if (!bgCanvas) return;
        bgCanvas.width = image.naturalWidth;
        bgCanvas.height = image.naturalHeight;
        const context = bgCanvas.getContext("2d");
        context?.drawImage(image, 0, 0);
      });
    };
    image.src = backgroundImageSourceUrl;
  }, [backgroundImageSourceUrl]);

  // Set drawing canvas size when canvasSize changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
  }, [canvasSize]);

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const renderStroke = (context: CanvasRenderingContext2D, stroke: Stroke) => {
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = stroke.width;

    if (stroke.eraser) {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "rgba(0,0,0,1)";
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = stroke.color;
    }

    if (stroke.tool === "pen" || stroke.tool === "eraser") {
      if (stroke.points.length < 2) {
        context.restore();
        return;
      }
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        context.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      context.stroke();
    } else if (stroke.tool === "line") {
      context.beginPath();
      context.moveTo(stroke.start.x, stroke.start.y);
      context.lineTo(stroke.end.x, stroke.end.y);
      context.stroke();
    } else if (stroke.tool === "rect") {
      const x = Math.min(stroke.start.x, stroke.end.x);
      const y = Math.min(stroke.start.y, stroke.end.y);
      const strokeWidth = Math.abs(stroke.end.x - stroke.start.x);
      const strokeHeight = Math.abs(stroke.end.y - stroke.start.y);
      context.strokeRect(x, y, strokeWidth, strokeHeight);
    } else if (stroke.tool === "circle") {
      const cx = (stroke.start.x + stroke.end.x) / 2;
      const cy = (stroke.start.y + stroke.end.y) / 2;
      const rx = Math.abs(stroke.end.x - stroke.start.x) / 2;
      const ry = Math.abs(stroke.end.y - stroke.start.y) / 2;
      context.beginPath();
      context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      context.stroke();
    }

    context.restore();
  };

  /* -- Drawing helpers -- */

  const redrawAll = useCallback((strokeList: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const state of strokeList) {
      renderStroke(context, state);
    }
  }, []);

  useEffect(() => {
    if (bgReady) redrawAll(strokes);
  }, [strokes, bgReady, redrawAll]);

  /* -- Coordinate helpers -- */

  const getPos = (e: CanvasPointerEvent): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const isTouchEvent = "touches" in e;
    const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;
    const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;
    // Scale from display coordinates to canvas internal coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  /* -- Pointer handlers -- */

  const handlePointerDown = (e: CanvasPointerEvent) => {
    e.preventDefault();
    const position = getPos(e);
    const isEraser = tool === "eraser";

    if (tool === "pen" || tool === "eraser") {
      setCurrentStroke({
        tool: isEraser ? "eraser" : "pen",
        color,
        width: SIZES[sizeIndex].width,
        eraser: isEraser,
        points: [position],
      });
    } else {
      setCurrentStroke({
        tool,
        color,
        width: SIZES[sizeIndex].width,
        eraser: false,
        start: position,
        end: position,
      });
    }
    setDrawing(true);
  };

  const handlePointerMove = (e: CanvasPointerEvent) => {
    if (!drawing || !currentStroke) return;
    e.preventDefault();
    const position = getPos(e);

    let updated: Stroke;
    if (currentStroke.tool === "pen" || currentStroke.tool === "eraser") {
      updated = {
        ...currentStroke,
        points: [...currentStroke.points, position],
      };
    } else {
      const shape = currentStroke as ShapeStroke;
      updated = { ...shape, end: position };
    }
    setCurrentStroke(updated);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    redrawAll(strokes);
    renderStroke(context, updated);
  };

  const handlePointerUp = () => {
    if (!drawing || !currentStroke) return;

    const isValid =
      currentStroke.tool === "pen" || currentStroke.tool === "eraser"
        ? currentStroke.points.length >= 2
        : true; // shape strokes always have start & end set

    if (isValid) {
      setStrokes((previousStrokes) => [...previousStrokes, currentStroke]);
    }
    setCurrentStroke(null);
    setDrawing(false);
  };

  /* -- Actions -- */

  const handleUndo = () => setStrokes((previousStrokes) => previousStrokes.slice(0, -1));
  const handleClear = () => setStrokes([]);

  const handleSave = () => {
    const offscreen = document.createElement("canvas");
    offscreen.width = canvasSize.width;
    offscreen.height = canvasSize.height;
    const context = offscreen.getContext("2d");
    if (!context) return;

    // Draw background
    if (backgroundImageSourceUrl && bgCanvasRef.current) {
      context.drawImage(bgCanvasRef.current, 0, 0);
    } else {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, offscreen.width, offscreen.height);
    }

    // Draw strokes
    const drawCanvas = canvasRef.current;
    if (drawCanvas) {
      context.drawImage(drawCanvas, 0, 0);
    }

    onSave(offscreen.toDataURL("image/png"));
  };

  const toolCursor = tool === "eraser" ? "cell" : "crosshair";

  return createPortal(
    <div className={`drawing-canvas-component ${styles['overlay']}`}>
      <button className={styles['close-button']} onClick={onClose} title="Close">
        <X size={22} />
      </button>

      {/* Toolbar */}
      <div className={styles['toolbar']}>
        {/* Tool buttons */}
        <div className={styles['tool-group']}>
          {TOOLS.map((toolOption) => {
            const Icon = toolOption.icon;
            return (
              <button
                key={toolOption.id}
                className={`${styles['tool-button']} ${tool === toolOption.id ? styles['tool-button-element-is-active-state'] : ""}`}
                onClick={() => setTool(toolOption.id)}
                title={toolOption.label}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>

        {/* Colors */}
        <div className={styles['tool-group']}>
          <span className={styles['tool-label']}>Color</span>
          {COLORS.map((colorOption) => (
            <button
              key={colorOption.value}
              className={`${styles['swatch']} ${color === colorOption.value && tool !== "eraser" ? styles['swatch-is-active-state'] : ""}`}
              style={{
                background: colorOption.value,
                border: colorOption.value === "#000000" ? "2px solid #555" : undefined,
              }}
              onClick={() => {
                setColor(colorOption.value);
                if (tool === "eraser") setTool("pen");
              }}
              title={colorOption.label}
            />
          ))}
        </div>

        {/* Sizes */}
        <div className={styles['tool-group']}>
          <span className={styles['tool-label']}>Size</span>
          {SIZES.map((sizeOption, i) => (
            <button
              key={sizeOption.label}
              className={`${styles['size-button']} ${sizeIndex === i ? styles['size-button-element-is-active-state'] : ""}`}
              onClick={() => setSizeIndex(i)}
              title={sizeOption.label}
            >
              <span
                className={styles['size-dot']}
                style={{ width: sizeOption.dot, height: sizeOption.dot }}
              />
            </button>
          ))}
        </div>

        {/* Undo / Clear */}
        <div className={styles['tool-group']}>
          <button
            className={styles['action-button']}
            onClick={handleUndo}
            disabled={strokes.length === 0}
            title="Undo"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            className={styles['action-button']}
            onClick={handleClear}
            disabled={strokes.length === 0}
            title="Clear all"
          >
            <Eraser size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className={styles['canvas-area']} ref={containerRef}>
        {/* Hidden bg canvas for compositing */}
        <canvas ref={bgCanvasRef} style={{ display: "none" }} />

        {/* Visible canvas */}
        <div
          className={styles['canvas-wrapper']}
          style={{ width: displaySize.width, height: displaySize.height }}
        >
          {/* Background: show source image or white */}
          {backgroundImageSourceUrl ? (
            <img
              src={backgroundImageSourceUrl}
              alt="Background"
              className={styles['background-image']}
              draggable={false}
            />
          ) : (
            <div className={styles['background-white']} />
          )}
          <canvas
            ref={canvasRef}
            className={styles['draw-canvas']}
            style={{ cursor: toolCursor }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className={styles['bottom-bar']}>
        <button className={styles['cancel-button']} onClick={onClose}>
          Cancel
        </button>
        <button className={styles['save-button']} onClick={handleSave}>
          <Save size={15} /> {backgroundImageSourceUrl ? "Save Changes" : "Use Drawing"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
