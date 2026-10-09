import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../app/money';
import { Button, Chip } from './ui';

type ShareCardProps = {
  currency: string;
  yearlyTotal?: number;
  saving?: number;
  doneSaving?: boolean;
  goodShape?: boolean;
};
type Tone = 'Calm' | 'Proud' | 'Honest';
type Format = 'Story' | 'Square';

export function ShareCard({ currency, yearlyTotal = 0, saving = 0, doneSaving = false, goodShape = false }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tone, setTone] = useState<Tone>('Calm');
  const [format, setFormat] = useState<Format>('Story');
  const [hideAmounts, setHideAmounts] = useState(false);
  const total = formatMoney(yearlyTotal, currency, { round: true });
  const found = formatMoney(saving, currency, { round: true });
  const textOnly = hideAmounts || goodShape;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const square = format === 'Square';
    const width = 1080;
    const height = square ? 1080 : 1920;
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#0e3b32';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.font = `800 ${square ? 44 : 56}px Archivo, system-ui, sans-serif`;
    context.fillText('Enough.', square ? 96 : 110, square ? 120 : 210);
    context.fillStyle = '#9fc2b6';
    context.font = `500 ${square ? 24 : 34}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const top = goodShape ? 'I CHECKED WHAT I PAY FOR' : textOnly ? 'WHAT I FOUND' : tone === 'Proud' ? `OUT OF ${total.toUpperCase()} A YEAR` : 'EVERY MONTH, ADDED UP';
    context.fillText(top, square ? 96 : 110, square ? 260 : 480);
    context.fillStyle = '#ffffff';
    const headline = goodShape ? "I'm in good shape." : textOnly ? 'I checked.' : tone === 'Proud' ? `I found ${found}.` : tone === 'Honest' ? 'I had no idea.' : total;
    const headlineSize = headline.length > 15 ? (square ? 92 : 142) : (square ? 180 : 270);
    context.font = `800 ${headlineSize}px Archivo, system-ui, sans-serif`;
    context.fillText(headline, square ? 96 : 110, square ? 480 : 870, width - (square ? 192 : 220));
    context.fillStyle = '#ffffff';
    context.font = `700 ${square ? 46 : 62}px Archivo, system-ui, sans-serif`;
    const caption = goodShape ? 'I checked what I pay for.' : textOnly
      ? 'A year of costs, finally in view.'
      : tone === 'Proud' ? 'Money I was paying for things I barely use.'
        : tone === 'Honest' ? `I pay ${total} a year for things I use every month.`
          : 'a year on things I pay for every month.';
    drawWrapped(context, caption, square ? 96 : 110, square ? 600 : 1040, width - (square ? 192 : 220), square ? 62 : 82);
    if (!textOnly && !goodShape) {
      context.fillStyle = '#c8f0dc';
      const result = doneSaving ? `${found} cut today.` : `${found} isn't earning its place.`;
      context.font = `800 ${square ? 44 : 62}px Archivo, system-ui, sans-serif`;
      drawWrapped(context, result, square ? 96 : 110, square ? 800 : 1310, width - (square ? 192 : 220), square ? 64 : 84);
    } else if (goodShape) {
      context.fillStyle = '#c8f0dc';
      context.font = `800 ${square ? 56 : 76}px Archivo, system-ui, sans-serif`;
      context.fillText('Nothing to cut.', square ? 96 : 110, square ? 800 : 1310);
    }
    context.fillStyle = '#9fc2b6';
    context.fillRect(square ? 96 : 110, height - (square ? 115 : 155), width - (square ? 192 : 220), 2);
    context.font = `500 ${square ? 20 : 28}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.fillText("KNOW WHAT'S WORTH PAYING FOR", square ? 96 : 110, height - (square ? 68 : 92));
  }, [doneSaving, format, found, goodShape, hideAmounts, tone, total, textOnly]);

  async function saveImage() {
    const blob = await canvasBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `enough-audit-${format.toLowerCase()}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareImage() {
    const blob = await canvasBlob();
    if (!blob) return;
    const file = new File([blob], `enough-audit-${format.toLowerCase()}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Enough audit' });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await saveImage();
  }

  async function canvasBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  return (
    <aside className="share-card-section" aria-label="Your share card">
      <div className="share-card-heading"><strong>Your share card</strong><span>NO NAMES · NO BANK DATA</span></div>
      <div className={`share-card-preview share-card-preview--${format.toLowerCase()}`}>
        <canvas ref={canvasRef} aria-label={goodShape ? "I checked. I'm in good shape." : `${doneSaving ? 'I cut' : 'I could cut'} ${found} a year`} />
      </div>
      {!goodShape && <>
        <div className="share-card-controls">
          <fieldset><legend>Tone</legend><div className="chip-wrap">
            {(['Calm', 'Proud', 'Honest'] as const).map((option) => <Chip key={option} selected={tone === option} onClick={() => setTone(option)}>{option}</Chip>)}
          </div></fieldset>
          <fieldset><legend>Format</legend><div className="chip-wrap">
            {(['Story', 'Square'] as const).map((option) => <Chip key={option} selected={format === option} onClick={() => setFormat(option)}>{option}</Chip>)}
          </div></fieldset>
        </div>
        <label className="share-card-hide"><span>Hide amounts, show only what I found</span><input type="checkbox" role="switch" checked={hideAmounts} onChange={(event) => setHideAmounts(event.target.checked)} /></label>
      </>}
      <p className="muted share-card-note">{goodShape ? 'Share that you checked what you pay for.' : doneSaving ? 'Based on the items you marked Done.' : 'Planned saving until you mark an item Done.'}</p>
      <div className="share-card-buttons"><Button variant="secondary" full onClick={() => void saveImage()}>Save image</Button><Button variant="secondary" full onClick={() => void shareImage()}>Share</Button></div>
    </aside>
  );
}

function drawWrapped(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      context.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = next;
  }
  if (line) context.fillText(line, x, y);
}
