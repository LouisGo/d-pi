import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const css=readFileSync('src/app/renderer/styles/tokens.css','utf8');
const block=(s)=>Object.fromEntries([...s.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m)=>[m[1],m[2].replace(/\s+/g,' ').trim()]));
const light=block(css.match(/:root \{([^]*?)\n\}/)[1]);
const dark={...light,...block(css.match(/\[data-theme="dark"\] \{([^]*?)\n\}/)[1])};
function resolve(s,t){s=s.replace(/var\((--[\w-]+)\)/g,(_,k)=>resolve(t[k],t));s=s.replace(/\( /g,'(').replace(/ \)/g,')');if(s.startsWith('#'))return s;const m=s.match(/^color-mix\(in srgb, (#[\da-f]{6}) (\d+)%, (#[\da-f]{6})\)$/i);if(!m)throw Error(s);const a=rgb(m[1]),b=rgb(m[3]),w=Number(m[2])/100;return '#'+a.map((n,i)=>Math.round(n*w+b[i]*(1-w)).toString(16).padStart(2,'0')).join('');}
function rgb(s){return [1,3,5].map(i=>Number.parseInt(s.slice(i,i+2),16))}
function lum(s){const v=rgb(s).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const rows=[];
for(const [theme,t] of [['light',light],['dark',dark]]){
 const color=(k)=>resolve(t['--'+k],t);
 for(const state of ['','-hover','-active'])for(const role of ['primary','emphasis']){
  const bg=color(role+state),fg=color(role+'-foreground'),ratio=contrast(bg,fg);
  assert(ratio>=4.5,`${theme} ${role}${state} text ${ratio}`);
  rows.push({theme,role:role+state,foreground:fg,background:bg,ratio:Number(ratio.toFixed(3)),threshold:4.5});
 }
 assert.notEqual(color('primary-hover'),color('primary'));
 assert.notEqual(color('primary-active'),color('primary'));
 for(const bgRole of ['surface','background'])for(const [fgRole,threshold] of [['emphasis',4.5],['control-border',3]]){
  const ratio=contrast(color(fgRole),color(bgRole));assert(ratio>=threshold,`${theme} ${fgRole} on ${bgRole} ${ratio}`);
  rows.push({theme,role:fgRole+' on '+bgRole,foreground:color(fgRole),background:color(bgRole),ratio:Number(ratio.toFixed(3)),threshold});
 }
}
writeFileSync('.scratch/beautiful-ui-system/evidence/contrast.json',JSON.stringify({method:'CSS token resolution with rounded sRGB color-mix channels; WCAG relative luminance. Disabled exempt. No browser pseudo-state simulation.',rows},null,2)+'\n');
console.log(`PASS: ${rows.length} semantic color pairs; neutral hover/active differ in both themes`);
