import React, { useEffect, useRef } from 'react';
import { Layers, Move, Maximize2, Zap, Activity, Plus } from 'lucide-react';

interface Props {
  onAddFirstWidget: () => void;
}

export function FuturisticEmptyCanvas({ onAddFirstWidget }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = canvas.offsetWidth;
    let h = canvas.offsetHeight;
    canvas.width = w;
    canvas.height = h;

    const particles: Array<{
      x: number; y: number; vx: number; vy: number;
      radius: number; alpha: number; color: string;
    }> = [];

    const colors = ['#38bdf8', '#0ea5e9', '#06b6d4', '#22d3ee', '#67e8f9'];

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let t = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      // Radial gradient background glow
      const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      grd.addColorStop(0, 'rgba(14, 165, 233, 0.06)');
      grd.addColorStop(0.5, 'rgba(6, 182, 212, 0.03)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);

      // Grid dots
      const gridGap = 32;
      for (let x = gridGap; x < w; x += gridGap) {
        for (let y = gridGap; y < h; y += gridGap) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.fill();
        }
      }

      // Animated neon wave lines
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        for (let x = 0; x <= w; x += 4) {
          const y = h / 2
            + Math.sin((x / w) * Math.PI * 3 + t * 0.4 + j * 2.1) * (20 + j * 10)
            + Math.sin((x / w) * Math.PI * 5 + t * 0.6 + j) * (8 + j * 4);
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(14, 165, 233, ${0.05 - j * 0.01})`;
        ctx.lineWidth = 1.5 - j * 0.3;
        ctx.stroke();
      }

      // Particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * (0.7 + 0.3 * Math.sin(t * 0.8 + p.x));
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.06 * (1 - dist / 80)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      t += 0.012;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    const observer = new ResizeObserver(() => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w;
      canvas.height = h;
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
    };
  }, []);

  const hints = [
    { icon: <Move className="w-4 h-4" />, label: 'Drag & Drop' },
    { icon: <Maximize2 className="w-4 h-4" />, label: 'Resize' },
    { icon: <Layers className="w-4 h-4" />, label: 'Arrange' },
    { icon: <Zap className="w-4 h-4" />, label: 'Live Insights' },
    { icon: <Activity className="w-4 h-4" />, label: 'Real-time' },
  ];

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden" style={{ minHeight: 480 }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />

      {/* Center glow */}
      <div
        className="absolute"
        style={{
          width: 400,
          height: 400,
          background: 'radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <div className="relative z-10 text-center max-w-lg px-8 select-none">
        {/* Icon cluster */}
        <div className="flex items-center justify-center mb-8">
          <div
            className="relative w-20 h-20 flex items-center justify-center rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(6,182,212,0.08) 100%)',
              border: '1px solid rgba(56,189,248,0.25)',
              boxShadow: '0 0 32px rgba(14,165,233,0.15), 0 0 64px rgba(14,165,233,0.06)',
            }}
          >
            <Layers className="w-9 h-9" style={{ color: '#38bdf8' }} />
            <div
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)', boxShadow: '0 0 12px rgba(14,165,233,0.6)' }}
            >
              <div className="w-1.5 h-1.5 bg-white rounded-full" />
            </div>
          </div>
        </div>

        <h2
          className="text-3xl font-bold mb-3 tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Your dashboard canvas is empty
        </h2>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: 'rgba(148,163,184,0.8)' }}>
          Drag widgets from the left panel to start building your
          intelligent operations dashboard
        </p>

        {/* Hints row */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-8">
          {hints.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(14,165,233,0.08)',
                border: '1px solid rgba(56,189,248,0.15)',
                color: 'rgba(148,163,184,0.9)',
              }}
            >
              <span style={{ color: '#38bdf8' }}>{h.icon}</span>
              {h.label}
            </div>
          ))}
        </div>

        {/* CTA button */}
        <button
          onClick={onAddFirstWidget}
          className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300"
          style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.9) 0%, rgba(6,182,212,0.9) 100%)',
            color: '#fff',
            boxShadow: '0 0 24px rgba(14,165,233,0.35), 0 4px 16px rgba(0,0,0,0.3)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 40px rgba(14,165,233,0.55), 0 8px 24px rgba(0,0,0,0.3)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(14,165,233,0.35), 0 4px 16px rgba(0,0,0,0.3)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
          }}
        >
          <Plus className="w-4 h-4" />
          Add Your First Widget
          <div
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%)' }}
          />
        </button>
      </div>
    </div>
  );
}
