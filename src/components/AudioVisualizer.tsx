import React, { useEffect, useState, useRef } from 'react';

interface AudioVisualizerProps {
  isRecording: boolean;
  volume: number;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isRecording, volume }) => {
  const [waveforms, setWaveforms] = useState<number[]>(Array(100).fill(0));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationFrameId: number;
  
    const draw = () => {
      drawWaveforms();
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);
  
  const lerp = (start: number, end: number, t: number) => {
    return start * (1 - t) + end * t;
  };
  
  useEffect(() => {
    let animationFrameId: number;
  
    const updateWaveforms = () => {
        setWaveforms(prevWaveforms => {
          return prevWaveforms.map((wf) => {
            const sensitivityMultiplier = 3; // Increase this value to increase sensitivity
            const targetValue = isRecording ? volume * Math.random() * 50 * sensitivityMultiplier : 0;
            return lerp(wf, targetValue, 0.05); // You can adjust the lerp factor as well for faster transitions
          });
        });
    };
      
  
    const draw = () => {
      updateWaveforms();
      drawWaveforms();
      animationFrameId = requestAnimationFrame(draw);
    };
  
    draw();
  
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [volume, isRecording]);


  useEffect(() => {
    drawWaveforms();
  }, [waveforms]);

  const drawWaveforms = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
  
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    const barWidth = 4.0;
    const color = isRecording ? 'red' : 'gray';
    const w = canvas.width;
    const h = canvas.height;
    const t = Math.floor(w / barWidth);
    const s = Math.max(0, waveforms.length - t);
    const m = h / 2;
    const r = barWidth / 2;
    const x = m - r;
  
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
  
    for (let i = s; i < waveforms.length; i++) {
      let v = h * waveforms[i] / 50.0;
      v = Math.max(Math.min(v, x), 3);
      const oneX = (i - s) * barWidth;
      const twoX = oneX + r;
      const threeX = twoX + r;
      const oneY = i % 2 === 1 ? m - v : m + v;
      const twoY = oneY;
      const twoS = i % 2 === 1 ? -Math.PI : Math.PI;
      const twoE = 0;
      const twoC = i % 2 === 0;
  
      ctx.beginPath();
      ctx.moveTo(oneX, m);
      ctx.lineTo(oneX, oneY);
      ctx.arc(twoX, twoY, r, twoS, twoE, twoC);
      ctx.lineTo(threeX, m);
      ctx.stroke();
    }
  };
  

  return (
    <canvas ref={canvasRef} className={`audio-visualizer ${isRecording ? 'recording' : ''}`}></canvas>
  );
};

export default AudioVisualizer;
