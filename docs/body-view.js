import {solfege, drumNames} from './body-music.js';

export function drawBody(ctx, width, height, detector, music, now, lastHit) {
  const colors = {Left: '#74e1dc', Right: '#ff709b'};
  const point = p => [p[0] * width, p[1] * height];
  const circle = (p, radius) => { ctx.beginPath(); ctx.arc(...point(p), radius, 0, Math.PI * 2); };
  for (const [hand, arm] of Object.entries(detector.arms)) {
    const color = colors[hand]; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(...point(arm.wrist)); ctx.lineTo(...point(arm.elbow)); ctx.stroke();
    ctx.lineWidth = 2;
    for (let zone = 0; zone < 4; zone++) {
      const t = .14 + (zone + .5) * .86 / 4;
      const p = arm.wrist.map((v, i) => v + (arm.elbow[i] - v) * t);
      circle(p, 21); ctx.fillStyle = '#10121cee'; ctx.fill(); ctx.stroke();
      const index = zone + (hand === 'Right' ? 4 : 0);
      const label = music.preset === 'drums' ? ['H', 'S', 'T', 'K'][zone] : music.preset === 'song' ? '♪' : music.preset === 'jazz' ? ['CΔ','Dm','Em','FΔ','G7','Am','Bø','CΔ'][index] : solfege[index];
      ctx.fillStyle = color; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, p[0] * width, p[1] * height + 5);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 4; circle(arm.palm, 17); ctx.stroke();
  }
  if (lastHit && now - lastHit.time < 600) {
    const elapsed = now - lastHit.time;
    ctx.globalAlpha = 1 - elapsed / 600; ctx.strokeStyle = '#edc989'; ctx.lineWidth = 4;
    circle(lastHit.cursor, 26 + elapsed / 9); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(lastHit.label, Math.max(100, Math.min(width - 100, lastHit.cursor[0] * width)), Math.max(78, lastHit.cursor[1] * height - 45));
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#10121cdd'; ctx.fillRect(0, height - 42, width, 42);
  ctx.fillStyle = '#f5f3ff'; ctx.font = '16px system-ui'; ctx.fillText(detector.hint, width / 2, height - 16);
  ctx.textAlign = 'left'; ctx.lineCap = 'butt';
}

export const padLabel = (preset, index) => preset === 'drums' ? drumNames[index % 4]
  : preset === 'jazz' ? ['Cmaj7','Dm7','Em7','Fmaj7','G7','Am7','Bø7','Cmaj7↑'][index]
  : preset === 'song' ? 'Next ♪' : solfege[index];
