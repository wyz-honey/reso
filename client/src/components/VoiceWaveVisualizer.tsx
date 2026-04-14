import { useEffect, useRef, type MutableRefObject } from 'react';

type Props = {
  active: boolean;
  analyserRef: MutableRefObject<AnalyserNode | null>;
  /** 无边框、仅波形（跟在识别文字后） */
  inline?: boolean;
};

/** 识别中时根据麦克风绘制时域波形（Canvas + rAF） */
export default function VoiceWaveVisualizer({ active, analyserRef, inline = false }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeDataRef = useRef<Uint8Array | null>(null);
  const smoothRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!active || !inline) return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const recordRgb = { r: 194, g: 65, b: 12 };
    const readAccentRgb = () => {
      const tryHex = (name: string) => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const m = raw.match(/^#([0-9a-fA-F]{6})$/i);
        if (!m) return false;
        const hex = m[1];
        recordRgb.r = parseInt(hex.slice(0, 2), 16);
        recordRgb.g = parseInt(hex.slice(2, 4), 16);
        recordRgb.b = parseInt(hex.slice(4, 6), 16);
        return true;
      };
      if (!tryHex('--record')) tryHex('--accent');
    };
    readAccentRgb();

    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const draw = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 4 || h < 4) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const midY = h * 0.5;
      const { r, g, b } = recordRgb;
      const an = analyserRef.current;
      const tSec = performance.now() / 1000;

      if (!an) {
        ctx.clearRect(0, 0, w, h);
        if (!reducedMotion) {
          const amp = h * 0.4;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r},${g},${b},0.45)`;
          ctx.lineWidth = 4;
          for (let x = 0; x <= w; x += 1) {
            const y = midY + Math.sin(x * 0.14 + tSec * 3.2) * amp * 0.48;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
          ctx.lineWidth = 1.65;
          for (let x = 0; x <= w; x += 1) {
            const y = midY + Math.sin(x * 0.14 + tSec * 3.2) * amp * 0.48;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(0, midY);
          ctx.lineTo(w, midY);
          ctx.stroke();
        }
        raf = requestAnimationFrame(draw);
        return;
      }

      const bufferLength = an.fftSize;
      if (!timeDataRef.current || timeDataRef.current.length !== bufferLength) {
        timeDataRef.current = new Uint8Array(bufferLength);
        smoothRef.current = new Float32Array(bufferLength);
      }
      const timeData = timeDataRef.current;
      const smooth = smoothRef.current!;
      an.getByteTimeDomainData(timeData);

      const blend = 0.42;
      let rms = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = (timeData[i] - 128) / 128;
        rms += v * v;
        smooth[i] = smooth[i] * (1 - blend) + v * blend;
      }
      rms = Math.sqrt(rms / bufferLength);

      const drawPts = Math.min(bufferLength, Math.max(20, Math.ceil(w * 2.8)));
      const idxAt = (p: number) => Math.floor((p / Math.max(1, drawPts - 1)) * (bufferLength - 1));
      const step = w / Math.max(1, drawPts - 1);
      const amp = h * 0.48;
      const pulse = Math.min(1, rms * 5);

      ctx.clearRect(0, 0, w, h);

      const yAt = (p: number) => midY - smooth[idxAt(p)] * amp;

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      for (let p = 0; p < drawPts; p++) {
        const x = p * step;
        const y = yAt(p);
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + pulse * 0.35})`;
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.beginPath();
      for (let p = 0; p < drawPts; p++) {
        const x = p * step;
        const y = yAt(p);
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.92 + pulse * 0.06})`;
      ctx.lineWidth = 1.65;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      const c = canvasRef.current;
      const cx = c?.getContext('2d');
      if (c && cx) cx.clearRect(0, 0, c.width, c.height);
    };
  }, [active, analyserRef, inline]);

  if (!inline) return null;

  return (
    <span ref={wrapRef} className="voice-wave-visualizer voice-wave-visualizer--inline" aria-hidden>
      <canvas ref={canvasRef} className="voice-wave-visualizer__canvas" />
    </span>
  );
}
