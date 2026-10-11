import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { runProcess } from './produce.mjs'
import { loudnessFrom, muxArguments, verifyFilmMetadata } from './finish.mjs'

const ease = value => 1 - (1 - Math.max(0, Math.min(1, value))) ** 3

export function motionState(frame, timeline) {
  if (timeline?.fps !== 30 || timeline.scenes?.length !== 3 ||
      !Number.isSafeInteger(frame) || frame < 0 || frame >= timeline.frameCount) {
    throw new Error('REVISION_TIMELINE_INVALID')
  }
  const scene = timeline.scenes.findIndex(item => frame >= item.startFrame && frame < item.endFrame)
  if (scene < 0) throw new Error('REVISION_TIMELINE_INVALID')
  const chapter = timeline.scenes[scene]
  const time = frame / 30
  const boundary = timeline.scenes.slice(1).find(item => Math.abs(frame - item.startFrame) <= 12)
  return { scene, frame, time, local:(frame-chapter.startFrame)/30,
    enter:ease((frame-chapter.startFrame)/32),
    reveal:ease((frame-chapter.cues[0].frame)/36),
    resolve:ease((frame-chapter.cues[1].frame)/36),
    sceneOpacity:boundary ? Math.abs(frame-boundary.startFrame)/12 : 1,
    caption:timeline.captions?.find(item=>time>=item.start && time<item.end)?.text ?? '' }
}

export function revisionPage(assets, product = '') {
  if (!['', 'OpsRamp', 'GreenLake', 'Morpheus'].includes(product)) throw new Error('REVISION_BRAND_INVALID')
  const brand = product ? `HPE ${product}` : 'HPE'
  const brandText = `<span class="brand-name" data-testid="brand-name" data-check>${brand}</span>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>From Signal to Decision | ${brand} fictional film</title>
<style>
@font-face{font-family:HPEGraphik;src:url(data:font/otf;base64,${assets.regular});font-weight:400}
@font-face{font-family:HPEGraphik;src:url(data:font/otf;base64,${assets.medium});font-weight:500}
@font-face{font-family:HPEGraphik;src:url(data:font/otf;base64,${assets.bold});font-weight:700}
:root{--ink:#102522;--green:#01a982;--forest:#061c19;--light:#f4f8f7;--blue:#0073a8;--lime:#c5ed97}
*{box-sizing:border-box;letter-spacing:0}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}
body{font-family:HPEGraphik,sans-serif;color:var(--ink);background:var(--forest)}
button{font:inherit;cursor:pointer}button:focus-visible{outline:4px solid #0073a8;outline-offset:4px}
.scene{position:absolute;inset:0;display:none;overflow:hidden;background:var(--light)}.scene.active{display:block}
.brand{position:absolute;left:100px;top:54px;display:flex;align-items:center;gap:28px;height:64px}
.hpe{width:98px;height:34px;border:7px solid var(--green)}.brand-name{font-family:HPEGraphik,sans-serif;font-size:38px;font-weight:500;white-space:nowrap}
.chapter{position:absolute;right:100px;top:70px;font-size:19px;color:#4d6860}
.eyebrow{font-size:22px;font-weight:500;text-transform:uppercase;color:#007b5e;margin-bottom:30px}
.headline{position:absolute;left:100px;top:260px;width:830px}.headline h1{font-size:102px;line-height:1.08;font-weight:500;margin:0}
.headline h1 span{color:#008567}.headline p{font-size:27px;line-height:1.5;max-width:590px;margin:36px 0 0;color:#46625a}
.disclaimer{position:absolute;left:100px;bottom:166px;font-size:19px;color:#47655a}
.track{position:absolute;left:100px;right:100px;bottom:142px;height:3px;background:#dce6e2}.track b{display:block;height:3px;background:var(--green);transform-origin:left}
.signal-art{position:absolute;left:980px;top:188px;width:840px;height:640px}
.signal-art svg{width:840px;height:640px}.signal-art text{font-family:HPEGraphik,sans-serif}
.signal-card{position:absolute;left:1090px;top:550px;width:650px;background:white;border:1px solid #b9d5ca;border-left:7px solid var(--green);padding:30px 34px;box-shadow:0 24px 64px #17372c16}
.signal-card .overline{font-size:17px;color:#527366}.signal-card strong{display:block;font-size:32px;font-weight:500;margin:16px 0}.signal-card .state{font-size:20px;color:#037558}
.signal-caption{position:absolute;left:1080px;top:790px;font-size:24px;color:#41665a}
.capture{background:var(--forest);color:#f7fcf9}.capture .chapter{color:#a4c1b4}
.capture-title{position:absolute;left:100px;top:166px;margin:0;font-size:52px;font-weight:500}
.capture-layout{position:absolute;left:100px;right:100px;top:270px;display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:48px;align-items:start}
.capture-media{aspect-ratio:16/9;overflow:hidden;background:#f4f6f7;color:var(--ink)}
.capture-app{position:relative;width:1280px;height:720px;transform-origin:top left}
.narration-notes{min-width:0}.notes-label{font-size:18px;color:#73e0b7;margin:0 0 24px}
.narration-point{padding:26px 0;border-top:1px solid #3d6d5d;opacity:.55}
.narration-point h3{font-size:32px;line-height:1.25;font-weight:500;margin:0 0 18px}
.narration-point p{font-size:24px;line-height:1.5;color:#c3d8ce;margin:0}
.capture .track{background:#294c3c}
.app-top{height:72px;display:flex;align-items:center;padding:0 24px;gap:20px;background:white;border-bottom:1px solid #d9e2e3}
.app-top .product{font-size:25px}
.fiction{margin-left:auto;color:#865310;background:#fff3d9;border:1px solid #ecd6a5;font-size:18px;padding:10px 16px;border-radius:4px}
.avatar{display:grid;place-items:center;background:#e6efed;color:#35544c;border-radius:50%;width:44px;height:44px;font-size:18px}
.rail{position:absolute;left:0;top:72px;bottom:0;width:168px;background:#fff;border-right:1px solid #d9e2e3;padding:24px 12px;font-size:20px}
.rail div{padding:16px 12px;margin-bottom:12px}.rail .selected{background:#e0f4ed;color:#006c4f;border-left:4px solid var(--green)}
.work{position:absolute;left:204px;right:24px;top:108px}.breadcrumbs{font-size:17px;color:#607770}.work h2{font-size:32px;font-weight:500;margin:18px 0 12px}
.work .subtitle{font-size:18px;color:#577268;margin-bottom:20px}.work-heading{display:flex;justify-content:space-between;align-items:center}
.counter{font-size:18px;color:#4e6b5e}.table{width:100%;border-collapse:collapse;background:white;border:1px solid #d4dfdc;text-align:left}
.table th{font-size:16px;font-weight:500;text-transform:uppercase;color:#658077;padding:18px 20px;border-bottom:1px solid #d4dfdc}
.table td{padding:22px 20px;font-size:24px}.table td:last-child{width:100px}.signal-row{color:#00785b;border:0;background:none;font-weight:500;padding:8px 0}
.badge{font-size:17px;white-space:nowrap;background:#fff3d9;color:#84530f;padding:8px 13px;border-radius:4px}.row-selected{background:#ecf8f2}
.below-table{font-size:19px;color:#6a8079;margin-top:28px}.drawer{position:absolute;left:204px;right:24px;top:414px;height:280px;background:white;border:1px solid #cbded5;display:none}
.drawer.open{display:block}.drawer-head{height:64px;display:flex;align-items:center;gap:24px;padding:0 24px;border-bottom:1px solid #e1e9e6}
.drawer-head strong{font-size:25px;font-weight:500;margin-right:auto}.tab{height:64px;border:0;background:white;font-size:20px;color:#5a7168;padding:0 24px;border-bottom:3px solid transparent}
.tab[aria-selected=true]{color:#00785b;border-bottom-color:var(--green)}.drawer-body{padding:24px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}
.detail-label{font-size:16px;text-transform:uppercase;color:#56756b;margin-bottom:14px}.detail-copy{font-size:24px;line-height:1.5;max-width:430px}.detail-foot{position:absolute;left:24px;bottom:20px;color:#00785b;font-size:18px}
.context-block{display:none}.drawer.context .context-block{display:grid}.drawer.context .summary-block{display:none}
.capture-label{position:absolute;left:100px;top:905px;font-size:18px;color:#a4c1b4}.cursor{position:absolute;left:0;top:0;z-index:8;pointer-events:none;width:30px;height:38px}
.cursor svg{filter:drop-shadow(0 2px 3px #0005);width:100%;height:100%}.click-ring{position:absolute;left:-15px;top:-15px;width:48px;height:48px;border:3px solid var(--green);border-radius:50%}
.close{background:var(--forest);color:#f7fcf9}.close .chapter{color:#a4c1b4}
.close .headline{top:232px;width:900px}.close .headline h1{font-size:94px}.close .eyebrow{color:#73e0b7}.close .headline h1 span{color:#72e2b5}.close .headline p{color:#aac5b7;font-size:28px}
.decision-record{position:absolute;left:1110px;top:240px;width:665px;height:535px;background:#f7fbf8;color:#102522;padding:42px;border-top:8px solid var(--green);box-shadow:24px 28px 0 #15362a}
.decision-record .record-label{font-size:18px;color:#4c7361}.decision-record h2{font-weight:500;font-size:39px;margin:26px 0 32px}.record-line{display:flex;gap:20px;padding:22px 0;border-top:1px solid #d4e0d8;align-items:center;font-size:25px}
.check{width:30px;height:30px;border:2px solid #008663;border-radius:50%;display:grid;place-items:center;color:#007c58;font-size:18px;flex-shrink:0}
.decision-pill{position:absolute;left:1110px;top:838px;padding:18px 26px;border:1px solid #65c9a0;color:#9be5c2;font-size:23px;max-width:700px}
.close .disclaimer{color:#a3bfae}.close .track{background:#294c3c}.end-signature{position:absolute;left:100px;top:731px;font-size:27px;color:#d5eee0}
.captions{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);max-width:1550px;white-space:pre;text-align:center;font-size:31px;line-height:1.32;background:#071a15f2;color:white;padding:12px 24px;border-radius:4px;z-index:30}.captions:empty{display:none}
</style></head><body>
<section class="scene active" data-scene="0">
<header class="brand"><div class="hpe"></div>${brandText}</header>
<div class="chapter" data-check>01 / NOTICE THE SIGNAL</div>
<div class="headline"><div class="eyebrow" data-check>From signal to decision</div><h1 data-check>A signal.<br><span>Not a decision.</span></h1><p data-check>Make the item visible.<br>Keep its meaning open.</p></div>
<div class="signal-art"><svg viewBox="0 0 840 640" aria-label="A signal enters a review list">
<path d="M45 100H180Q210 100 210 130V245Q210 285 250 285H630" fill="none" stroke="#b1cec0" stroke-width="3"/>
<path d="M70 430H160Q210 430 210 390V325Q210 285 250 285" fill="none" stroke="#b1cec0" stroke-width="3"/>
<path d="M320 60V235Q320 285 370 285" fill="none" stroke="#b1cec0" stroke-width="3"/>
<g fill="#fff" stroke="#9fbeae" stroke-width="2"><rect x="0" y="48" width="132" height="104" rx="8"/><rect x="254" y="8" width="132" height="104" rx="8"/><rect x="3" y="378" width="132" height="104" rx="8"/></g>
<g stroke="#007b5a" stroke-width="4" fill="none"><path d="M26 112h18V78h20v34h20V91h20"/><path d="M284 44h68M284 64h48M284 84h60"/><path d="M28 430h22l12-20 16 42 14-22h22"/></g>
<circle cx="625" cy="285" r="110" fill="#e2f5eb"/><circle cx="625" cy="285" r="83" fill="#fff" stroke="#009b73" stroke-width="3"/>
<path d="M594 255h62M594 285h62M594 315h43" stroke="#00785b" stroke-width="6" stroke-linecap="round"/>
<circle id="signal-pulse" cx="45" cy="100" r="12" fill="#00a77c"/><circle id="signal-halo" cx="625" cy="285" r="90" fill="none" stroke="#01a982" stroke-width="2"/>
<text x="530" y="438" font-size="22" fill="#41675a">REVIEW QUEUE</text></svg></div>
<div class="signal-card"><div class="overline" data-check>FICTIONAL SIGNAL / 01</div><strong data-check>A new item to understand</strong><div class="state" data-check>Visible. Awaiting review.</div></div>
<div class="signal-caption" data-check>No automatic conclusion.</div>
<div class="disclaimer" data-check>Fictional demo. Not product functionality or measured results.</div><div class="track"><b></b></div>
</section>
<section class="scene capture" data-scene="1">
<header class="brand"><div class="hpe"></div>${brandText}</header><div class="chapter" data-check>02 / READ THE CONTEXT</div>
<h2 class="capture-title" data-check>Read the context</h2>
<div class="capture-layout"><div class="capture-media" data-testid="capture-media"><div class="capture-app">
<header class="app-top"><div class="product" data-check>Signal review</div><span class="fiction" data-check>Fictional demo</span><div class="avatar">RV</div></header>
<nav class="rail"><div class="selected" data-check>Signals</div><div data-check>Decisions</div><div data-check>Activity</div></nav>
<main class="work"><div class="breadcrumbs" data-check>Workspace / Signal review</div><div class="work-heading"><h2 data-check>Signals</h2><div class="counter" data-check>1 item awaiting review</div></div><div class="subtitle" data-check>Review before taking action.</div>
<table class="table"><thead><tr><th data-check>Signal</th><th data-check>Review state</th><th data-check>Owner</th><th data-check>Record</th></tr></thead><tbody><tr id="signal-item"><td><button class="signal-row" data-testid="signal-row">Signal 01</button></td><td><span class="badge">Awaiting review</span></td><td data-check>Reviewer</td><td data-check>01</td></tr></tbody></table><p class="below-table" data-check>Illustrative data only. No connected systems.</p></main>
<aside class="drawer" data-testid="signal-details"><div class="drawer-head"><strong data-check>Signal 01</strong><button class="tab" data-testid="summary-tab" aria-selected="true">Summary</button><button class="tab" data-testid="context-tab" aria-selected="false">Context</button></div>
<div class="drawer-body summary-block"><div><div class="detail-label">Observed</div><div class="detail-copy" data-check>A signal appeared in the list.</div></div><div><div class="detail-label">State</div><div class="detail-copy" data-check>Meaning not yet determined.</div></div><div><div class="detail-label">Owner</div><div class="detail-copy" data-check>A human reviewer.</div></div></div>
<div class="drawer-body context-block"><div><div class="detail-label">What is known</div><div class="detail-copy" data-check>This is a fictional example.</div></div><div><div class="detail-label">What needs judgment</div><div class="detail-copy" data-check>Which details matter?</div></div><div><div class="detail-label">What remains open</div><div class="detail-copy" data-check>What needs clarification?</div></div></div><div class="detail-foot" data-check>Human judgment stays in the loop.</div></aside>
</div></div><aside class="narration-notes" data-testid="narration-notes">
<div class="notes-label" data-check>BEFORE TAKING ACTION</div>
<div class="narration-point" data-narration-point="0"><h3 data-check>Read relevant context</h3><p data-check>Look at the details around the signal.</p></div>
<div class="narration-point" data-narration-point="1"><h3 data-check>Apply human judgment</h3><p data-check>Decide what matters and what still needs clarification.</p></div>
</aside></div>
<div class="capture-label" data-check>Recorded browser interaction / Fictional demo</div>
<div class="cursor"><svg viewBox="0 0 30 38"><path d="M3 2v29l8-8 6 12 6-3-6-12 11-1Z" fill="#fff" stroke="#193e2e" stroke-width="2"/></svg><div class="click-ring"></div></div>
<div class="track"><b></b></div></section>
<section class="scene close" data-scene="2"><header class="brand"><div class="hpe"></div>${brandText}</header><div class="chapter" data-check>03 / CHOOSE THE NEXT STEP</div>
<div class="headline"><div class="eyebrow" data-check>The decision belongs to people</div><h1 data-check>Context informs.<br><span>People decide.</span></h1><p data-check>A recorded decision.<br>A reason. A next step.</p></div>
<div class="decision-record"><div class="record-label" data-check>ILLUSTRATIVE DECISION / 01</div><h2 data-check>Make the reasoning visible.</h2><div class="record-line"><span class="check">1</span><span data-check>Signal reviewed</span></div><div class="record-line"><span class="check">2</span><span data-check>Reasoning recorded</span></div><div class="record-line"><span class="check">3</span><span data-check>Next step made explicit</span></div></div>
<div class="decision-pill" data-check>Review complete. Not automatically resolved.</div><div class="end-signature" data-check>Notice. Understand. Decide.</div><div class="disclaimer" data-check>Fictional demo. Not product functionality or measured results.</div><div class="track"><b></b></div></section>
<div class="captions"></div>
<script>
window.captureEvents=[];
const row=document.querySelector('[data-testid="signal-row"]');
const drawer=document.querySelector('[data-testid="signal-details"]');
row.addEventListener('click',()=>{drawer.classList.add('open');document.querySelector('.below-table').hidden=true;document.getElementById('signal-item').classList.add('row-selected');window.captureEvents.push({action:'open-signal',frame:window.currentFrame});});
document.querySelector('[data-testid="context-tab"]').addEventListener('click',()=>{drawer.classList.add('context');document.querySelector('[data-testid="context-tab"]').setAttribute('aria-selected','true');document.querySelector('[data-testid="summary-tab"]').setAttribute('aria-selected','false');window.captureEvents.push({action:'open-context',frame:window.currentFrame});});
document.querySelector('[data-testid="summary-tab"]').addEventListener('click',()=>{drawer.classList.remove('context');document.querySelector('[data-testid="context-tab"]').setAttribute('aria-selected','false');document.querySelector('[data-testid="summary-tab"]').setAttribute('aria-selected','true');});
window.draw=state=>{
window.currentFrame=state.frame;
document.querySelectorAll('[data-scene]').forEach((element,index)=>{element.classList.toggle('active',index===state.scene);element.style.opacity=state.sceneOpacity;});
if(state.scene===1){document.querySelector('.capture-app').style.transform='scale('+document.querySelector('.capture-media').clientWidth/1280+')';}
document.querySelectorAll('[data-narration-point]').forEach((element,index)=>{element.style.opacity=.55+.45*[state.reveal,state.resolve][index];element.style.borderColor=[state.reveal,state.resolve][index]>.5?'#01a982':'#3d6d5d';});
document.querySelectorAll('.headline').forEach(element=>{element.style.opacity=state.enter;element.style.transform='translateY('+(1-state.enter)*38+'px)';});
document.querySelectorAll('.track b').forEach(element=>element.style.transform='scaleX('+Math.min(1,state.local/10)+')');
document.querySelector('.captions').textContent=state.caption;
const travel=Math.min(1,state.local/2.8);
const pulse=document.getElementById('signal-pulse');pulse.setAttribute('cx',45+580*travel);pulse.setAttribute('cy',100+185*Math.sin(travel*Math.PI/2));pulse.setAttribute('opacity',1-state.reveal);
const halo=document.getElementById('signal-halo');halo.setAttribute('r',90+state.reveal*55);halo.setAttribute('opacity',1-state.reveal);
document.querySelector('.signal-card').style.opacity=state.reveal;document.querySelector('.signal-card').style.transform='translateY('+(1-state.reveal)*60+'px)';
document.querySelector('.signal-caption').style.opacity=state.resolve;
document.querySelector('.decision-record').style.opacity=state.reveal;document.querySelector('.decision-record').style.transform='translate('+((1-state.reveal)*65)+'px,'+((1-state.reveal)*30)+'px)';
document.querySelector('.decision-pill').style.opacity=state.resolve;
document.querySelectorAll('.record-line').forEach((element,index)=>{const progress=Math.max(0,Math.min(1,state.reveal*3-index*.45));element.style.opacity=progress;element.style.transform='translateY('+(1-progress)*20+'px)';});
document.querySelector('.end-signature').style.opacity=state.resolve;
const first=Math.min(1,state.local/2.2);const second=Math.max(0,Math.min(1,(state.local-4)/2));
const rowBox=row.getBoundingClientRect();const tabBox=document.querySelector('[data-testid="context-tab"]').getBoundingClientRect();
const rowX=rowBox.left+rowBox.width/2,rowY=rowBox.top+rowBox.height/2,tabX=tabBox.left+tabBox.width/2,tabY=tabBox.top+tabBox.height/2;
const cursor=document.querySelector('.cursor');const cx=state.local<4?980+(rowX-980)*first:rowX+(tabX-rowX)*second;const cy=state.local<4?740+(rowY-740)*first:rowY+(tabY-rowY)*second;
cursor.style.transform='translate('+cx+'px,'+cy+'px)';
const ring=document.querySelector('.click-ring');const beat=Math.min(Math.abs(state.local-2.25),Math.abs(state.local-6.1));ring.style.opacity=Math.max(0,1-beat*3);ring.style.transform='scale('+(1+Math.min(1,beat)*2)+')';
};
</script></body></html>`
}

async function main() {
  const {values} = parseArgs({options:Object.fromEntries([
    'first-cut','output','assets','playwright','chromium','ffmpeg','ffprobe','consent-for','product'
  ].map(name=>[name,{type:'string'}]).concat([['preview',{type:'boolean',default:false}]]))})
  for (const name of ['first-cut','output','assets','playwright','chromium','ffmpeg','ffprobe']) {
    if (!values[name] || !isAbsolute(values[name])) throw new Error('REVISION_OPTIONS_INVALID')
  }
  const first = values['first-cut']
  const plan = JSON.parse(await readFile(join(first,'plan.json'),'utf8'))
  const timeline = JSON.parse(await readFile(join(first,'timing.json'),'utf8'))
  const firstReport = JSON.parse(await readFile(join(first,'render-report.json'),'utf8'))
  if (values['consent-for'] !== plan.input_fingerprint) throw new Error('RENDER_CONSENT_REQUIRED')
  const hash = data => createHash('sha256').update(data).digest('hex')
  if (hash(await readFile(join(first,'film.mp4'))) !== firstReport.outputSha256) throw new Error('FIRST_CUT_CHANGED')
  const output = values.output
  await mkdir(output,{mode:0o700})
  const assets = {}
  for (const name of ['Regular','Medium','Bold']) assets[name.toLowerCase()] =
    (await readFile(join(values.assets,'fonts',`HPEGraphik-${name}.otf`))).toString('base64')
  const html = revisionPage(assets, values.product ?? '')
  await writeFile(join(output,'film.html'),html,{flag:'wx',mode:0o600})
  const {chromium} = await import(pathToFileURL(values.playwright).href)
  const browser = await chromium.launch({executablePath:values.chromium,headless:true,
    args:['--disable-background-networking','--disable-component-update','--no-first-run']})
  let encoder
  try {
    const context = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,
      offline:true,serviceWorkers:'block'})
    let requests = 0
    await context.route('**/*',route=>{requests++;return route.abort()})
    const page = await context.newPage()
    const errors=[]
    page.on('pageerror',()=>errors.push('PAGE_ERROR'))
    await page.setContent(html)
    await page.evaluate(async()=>{
      await Promise.all([400,500,700].map(weight=>document.fonts.load(weight+' 30px HPEGraphik')))
      await document.fonts.ready
      await Promise.all([...document.images].map(image=>image.decode()))
    })
    async function layout(frame) {
      const result=await page.evaluate(()=>{
        const boxes=[...document.querySelectorAll('[data-check]')].filter(element=>{
          for(let parent=element;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||Number(style.opacity)<.05)return false}return true
        }).map(element=>{const rect=element.getBoundingClientRect();return {text:element.textContent,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}})
        const outside=boxes.filter(box=>box.left<20||box.right>1900||box.top<20||box.bottom>940)
        const overlaps=[]
        for(let first=0;first<boxes.length;first++)for(let second=first+1;second<boxes.length;second++){
          const left=boxes[first],right=boxes[second];if(Math.min(left.right,right.right)-Math.max(left.left,right.left)>4&&Math.min(left.bottom,right.bottom)-Math.max(left.top,right.top)>4)overlaps.push([left.text,right.text])
        }
        return {outside,overlaps,fonts:[400,500,700].every(weight=>document.fonts.check(weight+' 30px HPEGraphik'))}
      })
      if(result.outside.length||result.overlaps.length||!result.fonts){
        await writeFile(join(output,'layout-failure.json'),JSON.stringify({frame,...result},null,2))
        throw new Error('REVISION_LAYOUT_FAILED')
      }
    }
    const sampleFrames = new Set([30,100,210,303,304,310,400,540,650,681,682,688,800,930,1030])
    if(values.preview){
      for(const frame of [...sampleFrames].sort((left,right)=>left-right)){
        const state=motionState(frame,timeline);await page.evaluate(state=>window.draw(state),state)
        if(state.scene===1 && state.local>=2.25 && !(await page.getByTestId('signal-details').isVisible())) await page.getByTestId('signal-row').click()
        if(state.scene===1 && state.local>=6.1) await page.getByTestId('context-tab').click()
        await layout(frame)
        await page.screenshot({path:join(output,`frame-${frame}.png`)})
      }
      await writeFile(join(output,'preview.json'),JSON.stringify({status:'preview',requests,errors}))
      console.log(JSON.stringify({status:'preview',output}))
      return
    }
    const picture=join(output,'picture.mp4')
    const args=['-n','-v','error','-filter_threads','1','-f','image2pipe','-framerate','30',
      '-vcodec','png','-i','pipe:0','-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,'+
      'format=yuv420p,setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
      '-frames:v',String(timeline.frameCount),'-an','-c:v','libx264','-preset','fast','-crf','18',
      '-threads','2','-r','30','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709',
      '-color_trc','bt709','-g','60','-video_track_timescale','15360',picture]
    encoder=spawn(values.ffmpeg,args,{stdio:['pipe','ignore','pipe']})
    let encodeError=null
    encoder.stderr.on('data',()=>{})
    encoder.stdin.on('error',()=>{encodeError=new Error('REVISION_ENCODE_FAILED')})
    const finished=new Promise(resolveDone=>{
      encoder.on('error',()=>{encodeError=new Error('REVISION_ENCODE_FAILED');resolveDone()})
      encoder.on('close',code=>{if(code!==0)encodeError=new Error('REVISION_ENCODE_FAILED');resolveDone()})
    })
    let opened=false,contextOpened=false
    for(let frame=0;frame<timeline.frameCount;frame++){
      if(encodeError)throw encodeError
      const state=motionState(frame,timeline)
      await page.evaluate(state=>window.draw(state),state)
      if(state.scene===1&&state.local>=2.25&&!opened){await page.getByTestId('signal-row').click();opened=true}
      if(state.scene===1&&state.local>=6.1&&!contextOpened){await page.getByTestId('context-tab').click();contextOpened=true}
      if(sampleFrames.has(frame))await layout(frame)
      const png=await page.screenshot()
      if(sampleFrames.has(frame))await writeFile(join(output,`frame-${frame}.png`),png)
      if(!encoder.stdin.write(png))await once(encoder.stdin,'drain')
      if(frame%150===0)console.log(`Revision frames ${frame}/${timeline.frameCount}`)
    }
    encoder.stdin.end();await finished;if(encodeError)throw encodeError
    const events=await page.evaluate(()=>window.captureEvents)
    if(events.length!==2||requests||errors.length)throw new Error('REVISION_CAPTURE_FAILED')
    await writeFile(join(output,'capture-events.json'),JSON.stringify(events,null,2))
    for(const name of ['captions.srt','captions.vtt','chapters.ffmetadata','voice-normalized.wav']){
      await copyFile(join(first,name),join(output,name))
    }
    const film=join(output,'film.mp4')
    await runProcess(values.ffmpeg,muxArguments(timeline,{picture,voice:join(output,'voice-normalized.wav'),
      captions:join(output,'captions.srt'),metadata:join(output,'chapters.ffmetadata'),output:film}))
    const probe=await runProcess(values.ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-show_chapters','-of','json',film])
    verifyFilmMetadata(JSON.parse(probe.stdout),timeline)
    await runProcess(values.ffmpeg,['-v','error','-xerror','-nostdin','-i',film,'-map','0:v:0','-map','0:a:0','-f','null','-'])
    const levels=loudnessFrom((await runProcess(values.ffmpeg,['-hide_banner','-nostats','-i',film,
      '-map','0:a:0','-af','loudnorm=I=-16:TP=-1.8:LRA=7:print_format=json','-f','null','-'])).stderr)
    if(Math.abs(levels.input_i+16)>1||levels.input_tp> -1.5)throw new Error('FILM_LOUDNESS_FAILED')
    if(hash(await readFile(join(first,'film.mp4')))!==firstReport.outputSha256)throw new Error('FIRST_CUT_CHANGED')
    await writeFile(join(output,'render-report.json'),JSON.stringify({status:'awaiting_review',
      outputSha256:hash(await readFile(film)),firstCutSha256:firstReport.outputSha256,
      frameCount:timeline.frameCount,duration:timeline.duration,fullDecode:'passed',audioAnalysis:levels,
      actualBrowserInteractions:events,externalRequests:requests,watched:false,listened:false,
      production_qualified:false},null,2))
    console.log(JSON.stringify({status:'awaiting_review',film}))
  } finally {
    if(encoder && encoder.exitCode===null)encoder.kill('SIGKILL')
    await browser.close()
  }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{console.log(JSON.stringify({status:'failed',code:/^[A-Z_]+$/.test(error.message)?error.message:'REVISION_FAILED'}));process.exitCode=2})
}