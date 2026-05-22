/* v20260521-001 */
const F=n=>'\u00a3'+Math.round(n).toLocaleString('en-GB');
const FK=n=>'\u00a3'+Math.round(n/1000)+'k';
const FP=n=>n.toFixed(2)+'%';
const TD=()=>new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
const FT2=10.764;
const LOC={national:{m:1,l:'National'},london:{m:1.28,l:'London (+28%)'},southeast:{m:1.12,l:'SE (+12%)'}};
const FT2R=[180,200,225,250];
const WR={stone:310,brick:210,render:195},RR={concrete:185,slate:285,stone:320},GR={good:310,medium:420,poor:680};
const WALL_UP={150:{render:0,brick:18,stone:48},175:{render:0,brick:18,stone:48},200:{brick:0,render:-10,stone:30},225:{brick:0,render:-10,stone:30},250:{brick:0,render:-10,stone:30},custom:{brick:0,render:-10,stone:30}};
const ROOF_UP={concrete:0,slate:22,stone:28};
const GND_UP={good:0,medium:18,poor:48};
let ini={sp:0,hb:0,fs:0,ex:0},exTab=0,done=new Set(),rats={},oRat=0,hbTab=0;
const SP={gia:140,stage:2,pre:12,con:10,proj:'24 Elm Street',client:'Mr & Mrs Thompson',view:'cp',
  secs:[
    {lbl:'1. Substructure',its:[{n:'Excavation',q:140,r:85,u:'m\u00b2',a:0},{n:'Foundations',q:140,r:120,u:'m\u00b2',a:0},{n:'Ground slab',q:140,r:95,u:'m\u00b2',a:0}]},
    {lbl:'2. Superstructure',its:[{n:'External walls',q:242,r:210,u:'m\u00b2',a:0},{n:'Internal walls',q:182,r:85,u:'m\u00b2',a:0},{n:'Upper floors',q:98,r:115,u:'m\u00b2',a:0},{n:'Roof',q:160,r:185,u:'m\u00b2',a:0},{n:'Stairs',q:2,r:4200,u:'nr',a:0}]},
    {lbl:'3. Finishes',its:[{n:'Wall finishes',q:392,r:45,u:'m\u00b2',a:0},{n:'Floor finishes',q:140,r:95,u:'m\u00b2',a:0},{n:'Ceiling finishes',q:140,r:38,u:'m\u00b2',a:0},{n:'Kitchen & bathrooms',q:1,r:28000,u:'item',a:0}]},
    {lbl:'4. MEP',its:[{n:'Mechanical & plumbing',q:140,r:125,u:'m\u00b2',a:0},{n:'Electrical',q:140,r:95,u:'m\u00b2',a:0},{n:'MVHR',q:1,r:8500,u:'item',a:0}]},
    {lbl:'5. External',its:[{n:'Drainage',q:1,r:12000,u:'item',a:0},{n:'External works',q:1,r:18000,u:'item',a:0}]}
  ]
};
const HB={
  rateBand:200,customRate:260,unit:'ft2',
  wall:'brick',roof:'concrete',ground:'good',pre:12,con:10,
  types:[
    {l:'2-bed Bungalow',gia:70,n:0,en:false,sp:0,ovSp:false},
    {l:'3-bed Bungalow',gia:90,n:0,en:false,sp:0,ovSp:false},
    {l:'2-bed Semi',gia:75,n:0,en:false,sp:0,ovSp:false},
    {l:'2-bed Terrace',gia:78,n:0,en:false,sp:0,ovSp:false},
    {l:'3-bed Semi',gia:95,n:4,en:true,sp:280000,ovSp:true},
    {l:'3-bed Detached',gia:108,n:4,en:true,sp:340000,ovSp:true},
    {l:'4-bed Detached',gia:140,n:2,en:true,sp:420000,ovSp:true},
    {l:'4-bed Executive',gia:170,n:2,en:true,sp:520000,ovSp:true},
    {l:'5-bed Executive',gia:210,n:0,en:false,sp:0,ovSp:false},
  ],
  land:{actual:0,profPct:18,agentPct:1.5,sMktPct:1,infraPerPlot:8000},
  actuals:{}
};
const SVCS=[
  {cat:'Pre-Contract',name:'Feasibility & cost appraisal',desc:'Budget estimate & viability',pct:0.40,sel:true},
  {cat:'Pre-Contract',name:'Stage 2 cost plan',desc:'Concept design \u2014 NRM1',pct:0.50,sel:true},
  {cat:'Pre-Contract',name:'Stage 3 cost plan',desc:'Developed design',pct:0.45,sel:true},
  {cat:'Pre-Contract',name:'Stage 4 cost plan',desc:'Technical design',pct:0.35,sel:false},
  {cat:'Pre-Contract',name:'Bill of quantities',desc:'Full NRM2 BoQ',pct:0.75,sel:true},
  {cat:'Pre-Contract',name:'Tender analysis & report',desc:'Evaluation & recommendation',pct:0.30,sel:true},
  {cat:'Pre-Contract',name:'Procurement advice',desc:'Contract strategy',pct:0.25,sel:false},
  {cat:'Construction',name:"Employer's agent",desc:'JCT D&B administration',pct:0.80,sel:false},
  {cat:'Construction',name:'Interim valuations',desc:'Monthly valuations',pct:0.50,sel:false},
  {cat:'Construction',name:'Variation assessment',desc:'Pricing variations',pct:0.35,sel:false},
  {cat:'Construction',name:'Project monitoring',desc:'Lender / funder QS',pct:0.40,sel:false},
  {cat:'Post-Contract',name:'Final account',desc:'Negotiation & agreement',pct:0.40,sel:true},
  {cat:'Post-Contract',name:'Dispute resolution',desc:'Adjudication support',pct:0.35,sel:false},
];
const FSL={vendAsk:850000,prof:18,sMkt:2};
const FS={tab:'site',
  site:{name:'Oakfield Lane',pc:'NG1 1AA',ha:1.5,type:'greenfield',plan:'full'},
  mix:[{l:'2-bed terrace',gia:75,mkt:2,af:1,en:true},{l:'3-bed semi',gia:95,mkt:6,af:2,en:true},{l:'3-bed det',gia:108,mkt:4,af:1,en:true},{l:'4-bed det',gia:140,mkt:4,af:1,en:true},{l:'4-bed exec',gia:170,mkt:2,af:0,en:true}],
  px:{0:{mkt:220000,af:110000},1:{mkt:300000,af:150000},2:{mkt:360000,af:180000},3:{mkt:450000,af:225000},4:{mkt:580000,af:290000}},
  plan:{set:'suburban',aff:30,cil:50,bng:'onsite',bngC:800},
  spec:{loc:'national',ft2:200,useFt2:false,wall:'brick',roof:'concrete',ground:'good'},
  prog:{land:'2025-03-01',conStart:'2025-07-01',conMths:18,salesEnd:'2027-09-01'},
  fin:{lLTV:65,lRate:7.5,bLTC:75,bRate:8.0},
  pre:12,con:10,infra:8000,pFees:10,agent:1.5
};
function spCalc(){let b=0;SP.secs.forEach(s=>{s.tot=s.its.reduce((t,it)=>{it.tot=(+it.q||0)*(+it.r||0);return t+it.tot;},0);b+=s.tot;});const p=b*(SP.pre/100),c=(b+p)*(SP.con/100),g=b+p+c;return{base:b,pre:p,con:c,grand:g,m2:g/SP.gia};}
function hbSpecUplift(){const bk=HB.rateBand==='custom'?'custom':HB.rateBand;const wu=(WALL_UP[bk]||WALL_UP[200])[HB.wall]||0;const ru=ROOF_UP[HB.roof]||0;const gu=GND_UP[HB.ground]||0;return{wu,ru,gu,total:wu+ru+gu};}
function hbBaseFt2(){return HB.rateBand==='custom'?HB.customRate:HB.rateBand;}
function hbRateM2(){const ft2=hbBaseFt2();const m2=ft2*FT2;const up=hbSpecUplift();return m2+up.total;}
function hbCostUnit(gia){const rM2=hbRateM2();const base=rM2*gia;const p=base*(HB.pre/100),c=(base+p)*(HB.con/100);return base+p+c;}
function hbTot(){let u=0,b=0,gia=0,gdv=0;HB.types.forEach(t=>{if(!t.en||!t.n)return;u+=t.n;b+=hbCostUnit(t.gia)*t.n;gia+=t.gia*t.n;const bc=hbCostUnit(t.gia);const sug=Math.round(bc*1.35/5000)*5000;gdv+=t.n*(t.ovSp?t.sp:sug);});return{u,b,gia,gdv,avg:u?b/u:0};}
function hbResidual(hbt){const gdv=hbt.gdv,b=hbt.b,u=hbt.u,inf=HB.land.infraPerPlot*u,sM=gdv*(HB.land.sMktPct/100),ag=gdv*(HB.land.agentPct/100),pr=gdv*(HB.land.profPct/100),res=gdv-b-inf-sM-ag-pr;return{res,inf,sM,ag,pr};}
function sCurve(n){const r=[];let s=0;const sg=t=>1/(1+Math.exp(-10*(t-.5)));for(let i=0;i<n;i++){const v=sg((i+1)/n)-sg(i/n);r.push(v);s+=v;}return r.map(v=>v/s);}
function fsBuild(gia){const lm=LOC[FS.spec.loc||'national'].m;let base;if(FS.spec.useFt2){base=gia*FS.spec.ft2*FT2*lm;}else{const s=GR[FS.spec.ground]*gia,w=WR[FS.spec.wall]*gia*1.73,u2=185*gia,r=RR[FS.spec.roof]*gia*1.14,f=275*gia,m=230*gia,e=175*gia,st=(gia>=100?2:1)*4200;base=(s+w+u2+r+f+m+e+st)*lm;}const p=base*(FS.pre/100),c=(base+p)*(FS.con/100);return base+p+c;}
function fsCalc(){
  let tU=0,tMkt=0,tAf=0,tGIA=0,tB=0,gMkt=0,gAf=0;
  FS.mix.forEach((m,i)=>{if(!m.en)return;tU+=m.mkt+m.af;tMkt+=m.mkt;tAf+=m.af;tGIA+=m.gia*(m.mkt+m.af);tB+=fsBuild(m.gia)*(m.mkt+m.af);gMkt+=m.mkt*(FS.px[i]?.mkt||0);gAf+=m.af*(FS.px[i]?.af||0);});
  const gdv=gMkt+gAf,infra=FS.infra*tU,cil=FS.plan.cil*tGIA,bng=FS.plan.bng==='onsite'?FS.plan.bngC*tU:0,pF=tB*(FS.pFees/100),tC=tB+infra+cil+bng+pF;
  const sM=gdv*(FSL.sMkt/100),ag=gdv*(FS.agent/100),tP=gdv*(FSL.prof/100),lRes=gdv-tC-tP-sM-ag;
  const lPha=FS.site.ha>0?Math.max(0,lRes)/FS.site.ha:0,lvS=lPha<225000?'red':lPha<450000?'amber':'green';
  const lVal=Math.max(0,lRes),lLoan=lVal*(FS.fin.lLTV/100);
  const lS=new Date(FS.prog.land),lE=new Date(FS.prog.salesEnd);
  const lMths=Math.max(1,Math.round((lE-lS)/(1e3*60*60*24*30.44)));
  const lMR=FS.fin.lRate/100/12,lMoI=lLoan*lMR,lTotI=lMoI*lMths;
  const bLoan=tB*(FS.fin.bLTC/100);
  const bS=new Date(FS.prog.conStart),bEd=new Date(FS.prog.conStart);bEd.setMonth(bEd.getMonth()+(+FS.prog.conMths));
  const sE=new Date(FS.prog.salesEnd);
  const bMths=Math.max(1,Math.round((bEd-bS)/(1e3*60*60*24*30.44)));
  const tMths2=Math.max(0,Math.round((sE-bEd)/(1e3*60*60*24*30.44)));
  const bMR=FS.fin.bRate/100/12,cv=sCurve(bMths);
  let cum=0,bInt=0;const md=[];
  cv.forEach((p2,i)=>{const d=bLoan*p2;cum+=d;const int=cum*bMR;bInt+=int;md.push({m:i+1,d,cum,int});});
  const tInt=bLoan*bMR*tMths2,totBInt=bInt+tInt,avgMI=bMths?bInt/bMths:0,totFin=lTotI+totBInt,vGap=lRes-FSL.vendAsk;
  const net=gdv-tC-sM-ag-Math.max(0,lRes)-totFin,pog=gdv>0?(net/gdv)*100:0,viab=pog>=20?'good':pog>=15?'marginal':'poor';
  return{tU,tMkt,tAf,tGIA,tB,gdv,infra,cil,bng,pF,tC,sM,ag,tP,lRes,lPha,lvS,lVal,lLoan,lMths,lMR,lMoI,lTotI,bLoan,bMths,tMths:tMths2,bMR,bInt,tInt,totBInt,avgMI,md,totFin,vGap,net,pog,viab};
}
const pctOpts=(min,max,step,cur)=>Array.from({length:Math.round((max-min)/step)+1},(_,i)=>{var v=(min+i*step).toFixed(1);var sel=(+v===cur)?' selected':'';return'<option value="'+v+'"'+sel+'>'+v+'%</option>';}).join('');
function gv(i){document.querySelectorAll('.vw').forEach((v,j)=>v.classList.toggle('on',j===i));document.querySelectorAll('.mb').forEach((t,j)=>t.classList.toggle('on',j===i));if(i===1&&!ini.sp){rSP();ini.sp=1;}if(i===2&&!ini.hb){rHB();ini.hb=1;}if(i===3&&!ini.fs){rFS();ini.fs=1;}if(i===4&&!ini.ex){rEX();ini.ex=1;}window.scrollTo({top:0,behavior:'smooth'});}
function upd(){const b=document.querySelectorAll('input[type=checkbox]'),c=[...b].filter(x=>x.checked).length,p=Math.round(c/30*100);document.getElementById('pFill').style.width=p+'%';document.getElementById('pLbl').textContent=c+'/30 tasks';}
function mD(i){done.add(i);const n=document.getElementById('sn'+i);if(n){n.classList.add('dn');n.textContent='\u2713';}upd();}
function rat(i,n){rats[i]=n;document.querySelectorAll('#sr'+i+' .str').forEach(s=>s.classList.toggle('on',+s.dataset.n<=n));}
function ratO(n){oRat=n;document.querySelectorAll('.ors').forEach(s=>s.classList.toggle('on',+s.dataset.n<=n));}
function togS(h){const b=h.nextElementSibling,c=h.querySelector('.sv'),o=b.classList.contains('op');document.querySelectorAll('.sb').forEach(x=>x.classList.remove('op'));document.querySelectorAll('.sv').forEach(x=>x.classList.remove('op'));if(!o){b.classList.add('op');c.classList.add('op');}}
function subFb(){document.getElementById('fbF').style.display='none';document.getElementById('ty').style.display='block';}
function sH(id){return[1,2,3,4,5].map(x=>'<span class="str" onclick="rat('+id+','+x+')" data-n="'+x+'">\u2605</span>').join('');}
function rGuide(){
  const sc=[
    {id:0,t:'Build a Stage 2 cost plan \u2014 3-bed new build',d:'se',tool:1,tl:'Self Build Home',ck:['Cost plan built and rates reviewed','Custom line item added','PDF exported'],fb:'Were the rates realistic? Was anything missing?'},
    {id:1,t:'Generate a QS fee proposal',d:'se',tool:1,tl:'Self Build Home',ck:['Fee rates reviewed','Fee PDF exported'],fb:'Are the fee rates realistic?'},
    {id:2,t:'Track budget vs actual mid-project',d:'sm',tool:1,tl:'Self Build Home',ck:['Actual costs entered','Variances reviewed','BvA PDF exported'],fb:'Does the tracker give you what you need for a client report?'},
    {id:3,t:'Model a scheme \u2014 select ft\u00b2 rate band and spec',d:'se',tool:2,tl:'Housebuilder',ck:['Rate band selected (\u00a3150\u2013\u00a3250 or custom)','ft\u00b2/m\u00b2 toggle tested','Spec toggles tested and uplifts reviewed'],fb:'Do the rate bands and spec uplifts feel realistic for your market?'},
    {id:4,t:'Test the fee calculator \u2014 build a bespoke quote',d:'sm',tool:2,tl:'Housebuilder',ck:['Services ticked and unticked','Running fee % total reviewed','Fee PDF exported'],fb:'Does the tick-box fee calculator give a useful bespoke quote?'},
    {id:5,t:'Enter selling prices and check land value in Client View',d:'sm',tool:2,tl:'Housebuilder',ck:['Override sale prices entered per house type','GDV calculated correctly','Dropdown % selectors tested','Land value comparison reviewed'],fb:'Does the land value comparison help you assess whether you are paying too much for land?'},
    {id:6,t:'Appraise a 1.5ha greenfield site',d:'se',tool:3,tl:'Developer Suite',ck:['Site details entered','30% affordable housing configured'],fb:'Does the density suggestion match planning policy in your area?'},
    {id:7,t:'Enter vendor land ask and compare to residual',d:'sm',tool:3,tl:'Developer Suite',ck:['Vendor asking price entered in GDV & Land tab','Gap indicator reviewed'],fb:'Does the land comparison give you what you need when negotiating a site?'},
    {id:8,t:'Build detailed land and build finance model with S-curve',d:'sh',tool:3,tl:'Developer Suite',ck:['Land loan monthly interest reviewed','S-curve drawdown reviewed','Full appraisal PDF exported'],fb:'Is the S-curve drawdown realistic?'},
    {id:9,t:'Compare outline vs full planning \u2014 land value and finance impact',d:'sh',tool:3,tl:'Developer Suite',ck:['Planning switched to Outline','Finance cost impact reviewed'],fb:'Is the outline planning differential realistic?'},
    {id:10,t:'Price a single storey rear extension \u2014 rate band and spec',d:'se',tool:4,tl:'House Extension & Small Works',ck:['Extension type selected','Rate band selected and spec uplifts applied','Cost estimate PDF exported'],fb:'Do the extension rates feel realistic for your market?'},
    {id:11,t:'Test Planning & Regs tab and VAT summary for an extension',d:'se',tool:4,tl:'House Extension & Small Works',ck:['Planning status reviewed for chosen extension type','VAT tab reviewed','Building Regs parts checked'],fb:'Is the planning and VAT information accurate and useful?'},
    {id:12,t:'Run the extend vs move comparison for a homeowner client',d:'sm',tool:4,tl:'House Extension & Small Works',ck:['House values entered','SDLT auto-calculated and checked','Verdict reviewed \u2014 does it stack up?'],fb:'Is the extend vs move tool useful as a client-facing tool?'},
    {id:13,t:'Use the Materials tab inside Self Build Home \u2014 upload a drawing and check quantities',d:'sm',tool:1,tl:'Self Build Home',ck:['Materials tab opened inside Self Build Home','Drawing uploaded and AI analysis run','Dimensions reviewed and corrected','Materials schedule PDF exported'],fb:'Is the embedded materials calculator useful as part of the self build workflow?'},
    {id:14,t:'Use the Materials tab inside House Extension & Small Works',d:'se',tool:4,tl:'House Extension & Small Works',ck:['Materials tab opened inside Extensions','Dimensions entered manually','Openings added','CSV merchant list exported'],fb:'Does having materials inside the extensions tool feel natural?'},
  ];
  const clr={se:'background:#EAF3DE;color:#27500A',sm:'background:#FAEEDA;color:#633806',sh:'background:#FCEAEA;color:#8B1A1A'};
  const dl={se:'Easy',sm:'Medium',sh:'Advanced'};
  document.getElementById('v0').innerHTML='<div style="text-align:center;padding:1.75rem 1rem 2rem;border-bottom:1px solid var(--bd);margin-bottom:1.4rem"><div style="display:inline-block;font-size:.61rem;letter-spacing:.2em;text-transform:uppercase;color:var(--g);border:1px solid rgba(184,150,78,.3);padding:.25rem .85rem;margin-bottom:1rem">Beta Tester Access \u00b7 Confidential</div><h1 style="font-family:\'Cormorant Garamond\',serif;font-size:clamp(1.5rem,3vw,2.2rem);font-weight:600;color:var(--w);margin-bottom:.5rem;line-height:1.15">Welcome to the <em style="color:var(--g);font-style:italic">Signature QS Software</em> Beta</h1><p style="font-size:.83rem;color:#999;max-width:480px;margin:0 auto 1.25rem;line-height:1.75">Four professional QS tools \u2014 each with integrated AI Materials Calculator \u2014 including a new Extensions Calculator with ft\u00b2/m\u00b2 rate bands, spec uplifts, bespoke fee calculator, and full development appraisal with land value comparison.</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;max-width:500px;margin:0 auto">'
  +[['3 months','Free access'],['4 tools','To test'],['15 scenarios','30 tasks'],['~65 mins','Time needed']].map(([v,l])=>'<div style="background:rgba(255,255,255,.04);border:1px solid var(--bd);border-radius:6px;padding:.65rem;text-align:center"><div style="font-size:.85rem;font-weight:500">'+v+'</div><div style="font-size:.6rem;color:var(--mu);margin-top:2px;text-transform:uppercase;letter-spacing:.07em">'+l+'</div></div>').join('')
  +'</div></div><div class="sl">10 test scenarios</div>'
  +sc.map(s=>'<div class="sce"><div class="seh" onclick="togS(this)"><div class="sn" id="sn'+s.id+'">'+( s.id+1)+'</div><div class="st">'+s.t+'</div><span class="sbg" style="'+clr[s.d]+'">'+dl[s.d]+'</span><span class="sv">\u25be</span></div><div class="sb"><button class="tlb" onclick="gv('+s.tool+')">\u2192 Open '+s.tl+'</button>'+s.ck.map(c=>'<label class="ck"><input type="checkbox" onchange="upd()"/> '+c+'</label>').join('')+'<div class="fbx"><span class="fbl">Your feedback</span><textarea class="fbta" placeholder="'+s.fb+'"></textarea><div style="display:flex;gap:4px;margin-top:5px" id="sr'+s.id+'">'+sH(s.id)+'</div></div><button class="dbt" onclick="mD('+s.id+')">Mark complete \u2713</button></div></div>').join('')
  +'<div class="sl">Overall feedback</div><div id="fbF"><div style="background:var(--d2);border:1px solid rgba(184,150,78,.25);border-radius:8px;padding:1rem;text-align:center;margin-bottom:1.2rem"><div style="font-size:.65rem;color:var(--mu);text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px">Overall rating</div><div style="display:flex;justify-content:center;gap:7px">'
  +[1,2,3,4,5].map(n=>'<span class="ors" onclick="ratO('+n+')" data-n="'+n+'">\u2605</span>').join('')
  +'</div></div>'
  +[['What did you find most useful?','Which features saved you the most time?'],['What needs improvement or is missing?','Be specific \u2014 e.g. needs NRM2 codes'],['Would you pay for this? At what price?','Single Plot \u00a349/mo \u00b7 Housebuilder \u00a3199/mo \u00b7 Feasibility \u00a3399/mo'],['Any other comments','Anything else...']].map(([l,p])=>'<div style="margin-bottom:.85rem"><span class="fbl">'+l+'</span><textarea class="fta" placeholder="'+p+'"></textarea></div>').join('')
  +'<button class="sbt" onclick="subFb()">Submit feedback \u2192</button></div><div id="ty" style="text-align:center;padding:2.5rem 1rem;display:none"><div style="font-size:2.5rem;margin-bottom:1rem">\u1f3d7\ufe0f</div><div style="font-family:\'Cormorant Garamond\',serif;font-size:1.8rem;font-weight:600;margin-bottom:.6rem">Thank you \u2014 feedback received</div><div style="font-size:.85rem;color:#999;line-height:1.75;max-width:460px;margin:0 auto">We\'ll review every comment personally and be in touch within 48 hours. Send further feedback to <strong style="color:var(--g)">info@signatureconstructionprojects.co.uk</strong></div></div>';
}
function addSP(si){const n=document.getElementById('ni'+si)?.value?.trim();if(!n)return;SP.secs[si].its.push({n,q:+document.getElementById('nq'+si)?.value||1,r:+document.getElementById('nr'+si)?.value||0,u:'item',a:0,tot:0});rSP();}
function rSP(){
  const t=spCalc();
  const tabs=[['cp','Cost plan'],['bva','Budget vs Actual'],['fee','Fee calc'],['cv','Client view'],['mx','Materials']];
  let h='<div class="ms"><div class="mc"><div class="ml">Grand total</div><div class="mv go">'+F(t.grand)+'</div></div><div class="mc"><div class="ml">Cost/m\u00b2</div><div class="mv">'+F(t.m2)+'/m\u00b2</div></div><div class="mc"><div class="ml">Prelims</div><div class="mv">'+F(t.pre)+'</div></div><div class="mc"><div class="ml">Contingency</div><div class="mv">'+F(t.con)+'</div></div></div><div style="display:flex;gap:0;border:1px solid var(--bd);border-radius:6px;overflow:hidden;margin-bottom:.9rem">'+tabs.map(([v,l])=>'<button onclick="SP.view=\''+v+'\';rSP()" style="flex:1;padding:7px 4px;font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;background:'+(SP.view===v?'var(--g)':'transparent')+';color:'+(SP.view===v?'#111':'var(--mu)')+';border:none;cursor:pointer;font-family:\'DM Sans\',sans-serif;border-right:1px solid var(--bd)">'+l+'</button>').join('')+'</div>';
  if(SP.view==='cp'){
    h+='<div class="cd"><div class="ct">Project details</div><div class="g3"><div class="f"><label>Project</label><input value="'+SP.proj+'" onchange="SP.proj=this.value"/></div><div class="f"><label>Client</label><input value="'+SP.client+'" onchange="SP.client=this.value"/></div><div class="f"><label>GIA (m\u00b2)</label><input type="number" value="'+SP.gia+'" onchange="SP.gia=+this.value;rSP()"/></div><div class="f"><label>Stage</label><select onchange="SP.stage=+this.value;rSP()">'+[1,2,3,4,5].map(s=>'<option value="'+s+'"'+(s===SP.stage?' selected':'')+'>Stage '+s+'</option>').join('')+'</select></div><div class="f"><label>Prelims %</label><input type="number" value="'+SP.pre+'" onchange="SP.pre=+this.value;rSP()"/></div><div class="f"><label>Contingency %</label><input type="number" value="'+SP.con+'" onchange="SP.con=+this.value;rSP()"/></div></div></div>';
    const co='2fr .6fr .7fr .7fr 26px';
    h+='<div class="cd" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:'+co+';padding:5px 9px;background:rgba(255,255,255,.04);font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em"><span>Element</span><span style="text-align:right">Qty</span><span style="text-align:right">Rate</span><span style="text-align:right">Total</span><span></span></div>';
    SP.secs.forEach((s,si)=>{
      h+='<div style="display:grid;grid-template-columns:'+co+';padding:5px 9px;background:rgba(184,150,78,.05);border-top:1px solid var(--bd)"><span style="font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase">'+s.lbl+'</span><span></span><span></span><span style="font-size:11px;font-weight:500;text-align:right">'+F(s.tot||0)+'</span><span></span></div>';
      s.its.forEach((it,ii)=>{h+='<div style="display:grid;grid-template-columns:'+co+';padding:5px 9px;border-top:1px solid rgba(184,150,78,.04);align-items:center"><span style="font-size:11px">'+it.n+'</span><div style="display:flex;align-items:center;gap:2px;justify-content:flex-end"><input class="ni" type="number" value="'+it.q+'" onchange="SP.secs['+si+'].its['+ii+'].q=+this.value;rSP()" style="width:55px"/><span style="font-size:9px;color:var(--mu)">'+it.u+'</span></div><input class="ni" type="number" value="'+it.r+'" onchange="SP.secs['+si+'].its['+ii+'].r=+this.value;rSP()" style="width:62px;margin-left:auto"/><span style="font-size:11px;font-weight:500;text-align:right">'+F(it.tot||0)+'</span><button onclick="SP.secs['+si+'].its.splice('+ii+',1);rSP()" style="background:none;border:none;color:var(--mu);cursor:pointer;font-size:10px">\u2715</button></div>';});
      h+='<div style="display:flex;gap:4px;padding:5px 9px;border-top:1px solid var(--bd)"><input style="flex:1;font-size:11px;padding:3px 5px;border:1px solid var(--bd);border-radius:3px;background:rgba(255,255,255,.04);color:var(--w);font-family:\'DM Sans\',sans-serif" id="ni'+si+'" placeholder="Add item..."/><input class="ni" id="nq'+si+'" type="number" placeholder="Qty" style="width:42px"/><input class="ni" id="nr'+si+'" type="number" placeholder="Rate" style="width:52px"/><button class="bg" style="font-size:10px;padding:4px 7px" onclick="addSP('+si+')">+ Add</button></div>';
    });
    h+='<div style="padding:7px 9px;border-top:1px solid var(--bd);display:grid;grid-template-columns:'+co+'"><span style="font-size:11px;font-weight:500">Grand total</span><span></span><span></span><span style="font-size:12px;font-weight:500;text-align:right;color:var(--g)">'+F(t.grand)+'</span><span></span></div></div>';
  }
  if(SP.view==='bva'){
    const co='2fr .75fr .75fr .75fr .75fr';
    h+='<div class="cd" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:'+co+';padding:5px 9px;background:rgba(255,255,255,.04);font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em"><span>Element</span><span style="text-align:right">Budget</span><span style="text-align:right">Actual</span><span style="text-align:right">Remaining</span><span style="text-align:right">Variance</span></div>';
    SP.secs.forEach((s,si)=>{const sA=s.its.reduce((x,it)=>x+(+it.a||0),0);h+='<div style="display:grid;grid-template-columns:'+co+';padding:5px 9px;background:rgba(184,150,78,.05);border-top:1px solid var(--bd)"><span style="font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase">'+s.lbl+'</span><span style="font-size:11px;font-weight:500;text-align:right">'+F(s.tot||0)+'</span><span style="font-size:11px;text-align:right">'+F(sA)+'</span><span style="font-size:11px;text-align:right">'+F((s.tot||0)-sA)+'</span><span style="font-size:11px;font-weight:500;text-align:right;color:'+(sA>(s.tot||0)?'var(--rd)':'var(--gn)')+'">'+( sA>(s.tot||0)?'+':'')+F(sA-(s.tot||0))+'</span></div>';s.its.forEach((it,ii)=>{const b2=it.tot||0,a=+it.a||0,v=a-b2;h+='<div style="display:grid;grid-template-columns:'+co+';padding:5px 9px;border-top:1px solid rgba(184,150,78,.04);align-items:center"><span style="font-size:11px">'+it.n+'</span><span style="font-size:11px;text-align:right">'+F(b2)+'</span><input class="ni" type="number" value="'+(a||'')+'" placeholder="0" onchange="SP.secs['+si+'].its['+ii+'].a=+this.value;rSP()" style="width:68px;margin-left:auto"/><span style="font-size:11px;text-align:right">'+F(b2-a)+'</span><span style="font-size:11px;font-weight:500;text-align:right;color:'+(v>0?'var(--rd)':v<0?'var(--gn)':'var(--mu)')+'">'+( v>0?'+':'')+F(v)+'</span></div>';});});
    const tA=SP.secs.reduce((s,sec)=>s+sec.its.reduce((ss,it)=>ss+(+it.a||0),0),0);
    h+='<div style="padding:8px 9px;border-top:2px solid var(--bd);display:grid;grid-template-columns:'+co+';background:rgba(255,255,255,.03)"><span style="font-size:12px;font-weight:500">Total</span><span style="font-size:12px;font-weight:500;text-align:right">'+F(t.grand)+'</span><span style="font-size:12px;font-weight:500;text-align:right">'+F(tA)+'</span><span style="font-size:12px;font-weight:500;text-align:right">'+F(t.grand-tA)+'</span><span style="font-size:12px;font-weight:500;text-align:right;color:'+(tA>t.grand?'var(--rd)':'var(--gn)')+'">'+( tA>t.grand?'+':'')+F(tA-t.grand)+'</span></div></div>';
  }
  if(SP.view==='fee'){const sv=[{n:'Feasibility & cost appraisal',p:.4},{n:'Stage 2 cost plan',p:.5},{n:'Stage 3 cost plan',p:.45},{n:'Bill of quantities',p:.75},{n:'Tender analysis',p:.3},{n:'Final account',p:.4}];const tot=sv.reduce((s,x)=>s+t.grand*(x.p/100),0);h+='<div class="cd"><div class="ct">Fee calculator</div><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="background:rgba(255,255,255,.05);padding:5px 7px;text-align:left;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase">Service</th><th style="background:rgba(255,255,255,.05);padding:5px 7px;text-align:right;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase">Rate %</th><th style="background:rgba(255,255,255,.05);padding:5px 7px;text-align:right;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase">Fee ex VAT</th></tr></thead><tbody>'+sv.map(x=>'<tr><td style="padding:5px 7px;font-size:11px;color:#ccc;border-bottom:1px solid rgba(184,150,78,.05)">'+x.n+'</td><td style="padding:5px 7px;font-size:11px;text-align:right;border-bottom:1px solid rgba(184,150,78,.05);color:var(--mu)">'+x.p.toFixed(2)+'%</td><td style="padding:5px 7px;font-size:11px;text-align:right;border-bottom:1px solid rgba(184,150,78,.05);font-weight:500">'+F(t.grand*(x.p/100))+'</td></tr>').join('')+'</tbody></table><div class="fr" style="margin-top:.5rem"><span class="fl">Fee (ex VAT)</span><span class="fv">'+F(tot)+'</span></div><div class="fr"><span class="fl">VAT (20%)</span><span class="fv">'+F(tot*.2)+'</span></div><div class="fr"><span class="fl">Total (inc VAT)</span><span class="fv" style="color:var(--g)">'+F(tot*1.2)+'</span></div></div>';}
  if(SP.view==='cv'){h+='<div class="cd"><div class="ct">'+SP.proj+' \u2014 Client Summary</div>';SP.secs.forEach(s=>{const pct=t.base>0?Math.round((s.tot/t.base)*100):0;h+='<div style="margin-bottom:.65rem"><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:500;margin-bottom:3px"><span>'+s.lbl+'</span><span>'+F(s.tot||0)+' <span style="font-size:10px;color:var(--mu)">('+pct+'%)</span></span></div><div class="vb"><div class="vf" style="width:'+pct+'%;background:var(--bl)"></div></div></div>';});h+='<div class="fr"><span class="fl">Grand total</span><span class="fv" style="color:var(--g)">'+F(t.grand)+'</span></div></div>';}
  if(SP.view==='mx'){h+=renderMXInline('sp');}
  document.getElementById('v1').innerHTML=wrap('Self Build Home Calculator','RIBA cost plan \u00b7 Fee calculator \u00b7 Budget vs actual',h,1,'<button class="bg" onclick="spCP()">Cost Plan PDF</button><button class="bg" onclick="spFee()">Fee PDF</button><button class="bg" onclick="spBvA()">BvA PDF</button>');
}
function setHBTab(i){hbTab=i;rHB();}
function rHB(){
  const hbt=hbTot(),up=hbSpecUplift(),baseFt2=hbBaseFt2(),baseM2=Math.round(baseFt2*FT2),effM2=baseM2+up.total,effFt2=(effM2/FT2).toFixed(0);
  const metrics='<div class="ms"><div class="mc"><div class="ml">Total units</div><div class="mv">'+hbt.u+'</div></div><div class="mc"><div class="ml">Build cost</div><div class="mv go">'+F(hbt.b)+'</div></div><div class="mc"><div class="ml">Total GDV</div><div class="mv bl">'+F(hbt.gdv)+'</div></div><div class="mc"><div class="ml">Avg build/unit</div><div class="mv">'+F(hbt.avg)+'</div></div><div class="mc"><div class="ml">Effective rate</div><div class="mv" style="font-size:12px">'+(HB.unit==='ft2'?'\u00a3'+effFt2+'/ft\u00b2':'\u00a3'+effM2+'/m\u00b2')+'</div></div><div class="mc"><div class="ml">Spec uplifts</div><div class="mv" style="font-size:12px;color:'+(up.total>0?'var(--rd)':'var(--gn)')+'">+\u00a3'+up.total+'/m\u00b2</div></div></div>';
  const subTabs='<div class="subtabs">'+['Cost Plan','Budget vs Actual','Fee Calculator','Client View','Materials'].map((l,i)=>'<button class="stab'+(hbTab===i?' active':'')+'" onclick="setHBTab('+i+')">'+l+'</button>').join('')+'</div>';
  let body='';
  if(hbTab===0){
    body+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.9rem"><div style="font-size:11px;color:var(--mu)">Display rates in:</div><div class="unit-toggle"><button class="ut'+(HB.unit==='ft2'?' on':'')+'" onclick="HB.unit=\'ft2\';rHB()">\u00a3/ft\u00b2</button><button class="ut'+(HB.unit==='m2'?' on':'')+'" onclick="HB.unit=\'m2\';rHB()">\u00a3/m\u00b2</button></div></div>';
    body+='<div class="cd"><div class="ct">Build rate band <span style="font-size:10px;font-weight:400;color:var(--mu)">Select a band or enter custom rate</span></div><div class="rate-bands">'+[150,175,200,225,250,'custom'].map(b=>{const ft2=b==='custom'?HB.customRate:b;const m2=Math.round(ft2*FT2);const isOn=HB.rateBand===b;const inc=b===150||b===175?'Render+concrete+good':b==='custom'?'Your rate':'Brick+concrete+good';return'<div class="rb'+(isOn?' on':'')+'" onclick="HB.rateBand=\''+b+'\';rHB()"><div class="rb-ft2">'+(b==='custom'?'Custom':'\u00a3'+b+'/ft\u00b2')+'</div><div class="rb-m2">'+( HB.unit==='ft2'?'\u2248 \u00a3'+m2+'/m\u00b2':'\u00a3'+m2+'/m\u00b2')+'</div><div class="rb-inc">'+inc+'</div></div>';}).join('')+'</div>'+(HB.rateBand==='custom'?'<div class="cr-wrap"><span class="cr-label">Enter your all-in build rate:</span><input class="cr-input" type="number" value="'+HB.customRate+'" step="5" min="100" max="600" oninput="HB.customRate=+this.value;rHB()" onchange="HB.customRate=+this.value;rHB()"/><span class="cr-unit">/ft\u00b2 &nbsp;\u2248 \u00a3'+Math.round(HB.customRate*FT2)+'/m\u00b2</span></div>':'')+'<div class="divider"></div><div class="tgl">External walls '+(up.wu!==0?'<span style="color:'+(up.wu>0?'var(--rd)':'var(--gn)')+'">+\u00a3'+up.wu+'/m\u00b2 uplift applied</span>':'')+'</div><div class="trow">'+['brick','stone','render'].map(v=>{const bk=HB.rateBand==='custom'?'custom':HB.rateBand;const wu=(WALL_UP[bk]||WALL_UP[200])[v]||0;return'<div class="tog'+(HB.wall===v?' on':'')+'" onclick="HB.wall=\''+v+'\';rHB()">'+v.charAt(0).toUpperCase()+v.slice(1)+(wu!==0?' <span style="font-size:9px">'+(wu>0?'+':'')+wu+'/m\u00b2</span>':'')+'</div>';}).join('')+'</div><div class="tgl">Roof finish '+(up.ru>0?'<span style="color:var(--rd)">+\u00a3'+up.ru+'/m\u00b2 uplift applied</span>':'')+'</div><div class="trow">'+['concrete','slate','stone'].map(v=>{const ru=ROOF_UP[v];return'<div class="tog'+(HB.roof===v?' on':'')+'" onclick="HB.roof=\''+v+'\';rHB()">'+(v==='concrete'?'Concrete':v==='slate'?'Natural slate':'Stone tiles')+(ru>0?' <span style="font-size:9px">+'+ru+'/m\u00b2</span>':'')+'</div>';}).join('')+'</div><div class="tgl">Ground conditions '+(up.gu>0?'<span style="color:var(--rd)">+\u00a3'+up.gu+'/m\u00b2 uplift applied</span>':'')+'</div><div class="trow">'+['good','medium','poor'].map(v=>{const gu=GND_UP[v];return'<div class="tog'+(HB.ground===v?' on':'')+'" onclick="HB.ground=\''+v+'\';rHB()">'+(v==='good'?'Good ground':v==='medium'?'Medium bearing':'Poor / piles')+(gu>0?' <span style="font-size:9px">+'+gu+'/m\u00b2</span>':'')+'</div>';}).join('')+'</div>'+(up.total>0?'<div class="ib">Effective rate: base \u00a3'+baseFt2+'/ft\u00b2 (\u00a3'+baseM2+'/m\u00b2) + spec uplifts \u00a3'+up.total+'/m\u00b2 = <strong>\u00a3'+effM2+'/m\u00b2</strong> (\u2248 \u00a3'+effFt2+'/ft\u00b2)</div>':'<div class="ib">Base spec included in rate \u2014 no uplifts applied at current spec selection.</div>')+'<div class="g2"><div class="f"><label>Prelims %</label><input type="number" value="'+HB.pre+'" step="1" onchange="HB.pre=+this.value;rHB()"/></div><div class="f"><label>Contingency %</label><input type="number" value="'+HB.con+'" step="1" onchange="HB.con=+this.value;rHB()"/></div></div></div>';
    body+='<div class="cd"><div class="ct">House type matrix</div><div style="overflow-x:auto"><table class="mtbl"><thead><tr><th style="min-width:140px">House type</th><th style="text-align:right">GIA m\u00b2</th><th style="text-align:right">Plots</th><th style="text-align:right">Rate/m\u00b2</th><th style="text-align:right">Cost/plot</th><th style="text-align:right">Line total</th></tr></thead><tbody>'+HB.types.map((t,i)=>{const c=hbCostUnit(t.gia),rm2=Math.round(hbRateM2());return'<tr style="'+(t.en?'':'opacity:.45')+'"><td><label style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" '+(t.en?'checked':'')+' onchange="HB.types['+i+'].en=this.checked;rHB()" style="accent-color:var(--g);width:13px;height:13px;flex-shrink:0"/><span style="font-size:11px">'+t.l+'</span></label></td><td><input class="ni" type="number" value="'+t.gia+'" onchange="HB.types['+i+'].gia=+this.value;rHB()" style="width:75px"/></td><td><input class="ni" type="number" value="'+t.n+'" onchange="HB.types['+i+'].n=+this.value;rHB()" style="width:75px"/></td><td style="color:var(--mu)">'+F(rm2)+'/m\u00b2</td><td>'+(t.en?F(c):'\u2014')+'</td><td>'+(t.en&&t.n?F(c*t.n):'\u2014')+'</td></tr>';}).join('')+'<tr class="total-row"><td>Total</td><td></td><td>'+hbt.u+' plots</td><td></td><td></td><td>'+F(hbt.b)+'</td></tr></tbody></table></div></div>';
  }
  if(hbTab===1){
    const segs=[{s:'Substructure',pct:.18},{s:'Superstructure',pct:.28},{s:'Finishes & Fittings',pct:.22},{s:'MEP Services',pct:.20},{s:'External Works',pct:.12}];
    if(hbt.u===0){body='<div class="ib">Add house types in the Cost Plan tab first.</div>';}
    else{let tB=0,tA=0;body+='<div class="cd" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;padding:6px 9px;background:rgba(255,255,255,.05);font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em"><span>Section</span><span style="text-align:right">Budget</span><span style="text-align:right">Actual</span><span style="text-align:right">Remaining</span><span style="text-align:right">Variance</span></div>';segs.forEach((sec,i)=>{const bud=Math.round(hbt.b*sec.pct),act=HB.actuals[i]||0,rem=bud-act,vari=act-bud;tB+=bud;tA+=act;body+='<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;padding:6px 9px;border-top:1px solid rgba(184,150,78,.06);align-items:center"><span style="font-size:11px">'+sec.s+'</span><span style="font-size:11px;text-align:right;color:var(--mu)">'+F(bud)+'</span><input class="ni w" type="number" value="'+(act||'')+'" placeholder="0" onchange="HB.actuals['+i+']=+this.value;rHB()" style="margin-left:auto"/><span style="font-size:11px;text-align:right">'+F(rem)+'</span><span style="font-size:11px;font-weight:500;text-align:right;color:'+(vari>0?'var(--rd)':vari<0?'var(--gn)':'var(--mu)')+'">'+( vari>0?'+':'')+F(vari)+'</span></div>';});const tv=tA-tB;body+='<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;padding:8px 9px;background:rgba(255,255,255,.03);border-top:2px solid var(--bd)"><span style="font-size:12px;font-weight:600">Total</span><span style="font-size:12px;font-weight:600;text-align:right">'+F(tB)+'</span><span style="font-size:12px;font-weight:600;text-align:right">'+F(tA)+'</span><span style="font-size:12px;font-weight:600;text-align:right">'+F(tB-tA)+'</span><span style="font-size:12px;font-weight:600;text-align:right;color:'+(tv>0?'var(--rd)':'var(--gn)')+'">'+( tv>0?'+':'')+F(tv)+'</span></div></div>';}
  }
  if(hbTab===2){
    const bc=hbt.b,sel=SVCS.filter(s=>s.sel),totPct=sel.reduce((t,s)=>t+s.pct,0),totFee=bc*(totPct/100),vat=totFee*.2,totVat=totFee+vat;
    body+='<div class="cd"><div class="ct">Fee summary <span class="fpb">'+FP(totPct)+' of build cost</span></div><div class="g3"><div class="mc"><div class="ml">Build cost</div><div class="mv">'+F(bc)+'</div></div><div class="mc"><div class="ml">Total fee % selected</div><div class="mv go">'+FP(totPct)+'</div><div class="vb"><div class="vf" style="width:'+Math.min(100,(totPct/5)*100)+'%"></div></div></div><div class="mc"><div class="ml">Total fee (ex VAT)</div><div class="mv go">'+F(totFee)+'</div></div></div></div><div class="cd" style="padding:0;overflow:hidden"><div class="fee-row-hb fhdr"><span>Service</span><span style="text-align:right">Rate %</span><span style="text-align:right">Fee ex VAT</span><span style="text-align:right">Inc VAT</span><span style="text-align:center">\u2713</span></div>';
    ['Pre-Contract','Construction','Post-Contract'].forEach(cat=>{
      body+='<div style="display:grid;grid-template-columns:1fr 65px 85px 85px 34px;padding:5px 9px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(184,150,78,.06)"><span style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--mu)">'+cat+'</span><span></span><span></span><span></span><span></span></div>';
      SVCS.filter(s=>s.cat===cat).forEach(svc=>{const gi=SVCS.indexOf(svc),fee=bc*(svc.pct/100);body+='<div class="fee-row'+(svc.sel?'':' inactive')+'"><div class="fee-nm">'+svc.name+'<div class="fd">'+svc.desc+'</div></div><div class="fee-pct">'+FP(svc.pct)+'</div><div class="fee-v'+(svc.sel?' av':'')+'">'+( svc.sel?F(fee):'\u2014')+'</div><div class="fee-v'+(svc.sel?' av':'')+'">'+( svc.sel?F(fee*1.2):'\u2014')+'</div><div class="fee-ck"><input type="checkbox" '+(svc.sel?'checked':'')+' onchange="SVCS['+gi+'].sel=this.checked;rHB()"/></div></div>';});
    });
    body+='<div class="fee-tot"><div class="ftl">Total selected</div><div class="ftp">'+FP(totPct)+'</div><div class="ftv">'+F(totFee)+'</div><div class="ftv">'+F(totVat)+'</div><div></div></div></div><div class="fee-sum"><div class="fee-sum-row"><span style="color:var(--mu)">Services selected</span><span>'+sel.length+' of '+SVCS.length+'</span></div><div class="fee-sum-row"><span style="color:var(--mu)">Total fee % of build</span><span style="color:var(--g);font-weight:600">'+FP(totPct)+'</span></div><div class="fee-sum-row"><span style="color:var(--mu)">Fee (ex VAT)</span><span>'+F(totFee)+'</span></div><div class="fee-sum-row"><span style="color:var(--mu)">VAT (20%)</span><span>'+F(vat)+'</span></div><div class="fee-sum-row"><span>Total payable (inc VAT)</span><span>'+F(totVat)+'</span></div></div>';
  }
  if(hbTab===3){
    const active=HB.types.filter(t=>t.en&&t.n>0);
    if(active.length===0){body='<div class="ib">Select house types in the Cost Plan tab first.</div>';}
    else{
      const res=hbResidual(hbt),actualLand=HB.land.actual||0,landGap=res.res-actualLand;
      const gs=landGap>=0?'good':landGap>-Math.max(1,res.res)*.15?'marginal':'bad';
      const gapMsg=landGap>=0?'\u2705 Land cost '+F(Math.abs(landGap))+' BELOW suggested value':landGap>-Math.max(1,res.res)*.15?'\u26a0\ufe0f Land cost '+F(Math.abs(landGap))+' above suggested \u2014 marginal':'\u0001f6a8 Land cost '+F(Math.abs(landGap))+' above suggested \u2014 review viability';
      const gbg=gs==='good'?'rgba(151,196,89,.1)':gs==='marginal'?'rgba(186,117,23,.1)':'rgba(224,82,82,.1)';
      const gbr=gs==='good'?'var(--gn)':gs==='marginal'?'var(--g)':'var(--rd)';
      body+='<div class="cd"><div class="ct">GDV \u2014 anticipated selling prices <span style="font-size:10px;color:var(--mu);font-weight:400">Suggested price shown \u00b7 type to override</span></div><table class="gdv-tbl"><thead><tr><th>House type</th><th style="text-align:right">Plots</th><th style="text-align:right">Suggested</th><th style="text-align:right">Your price</th><th style="text-align:right">Build cost</th><th style="text-align:right">Margin</th><th style="text-align:right">Line GDV</th></tr></thead><tbody>'+active.map(t=>{const i=HB.types.indexOf(t),bc=hbCostUnit(t.gia),sug=Math.round(bc*1.35/5000)*5000,sp=t.ovSp?t.sp:sug,margin=sp-bc,lineGdv=sp*t.n;return'<tr><td style="font-size:11px">'+t.l+'</td><td>'+t.n+'</td><td style="color:var(--mu)">'+F(sug)+'</td><td><input class="sp-input" type="number" value="'+(t.ovSp?t.sp:'')+'" step="5000" placeholder="'+F(sug)+'" oninput="HB.types['+i+'].sp=+this.value||'+sug+';HB.types['+i+'].ovSp=this.value!==\'\';rHB()" onchange="HB.types['+i+'].sp=+this.value||'+sug+';HB.types['+i+'].ovSp=this.value!==\'\';rHB()"/></td><td>'+F(bc)+'</td><td style="color:'+(margin>0?'var(--gn)':margin<0?'var(--rd)':'var(--mu)')+';font-weight:500">'+( margin>0?'+':'')+F(margin)+'</td><td style="font-weight:500;color:var(--bl)">'+F(lineGdv)+'</td></tr>';}).join('')+'<tr class="tot"><td>Total GDV</td><td>'+hbt.u+'</td><td></td><td></td><td>'+F(hbt.b)+'</td><td></td><td style="color:var(--bl)">'+F(hbt.gdv)+'</td></tr></tbody></table></div>';
      body+='<div class="cd"><div class="ct">Appraisal assumptions</div><div class="g4"><div class="f"><label>Target profit on GDV</label><select onchange="HB.land.profPct=+this.value;rHB()">'+pctOpts(5,35,.5,HB.land.profPct)+'</select></div><div class="f"><label>Sales & marketing</label><select onchange="HB.land.sMktPct=+this.value;rHB()">'+pctOpts(0.5,10,.5,HB.land.sMktPct)+'</select></div><div class="f"><label>Agent fees</label><select onchange="HB.land.agentPct=+this.value;rHB()">'+pctOpts(0.5,5,.25,HB.land.agentPct)+'</select></div><div class="f"><label>Infrastructure (\u00a3/plot)</label><input type="number" value="'+HB.land.infraPerPlot+'" step="500" oninput="HB.land.infraPerPlot=+this.value;rHB()" onchange="HB.land.infraPerPlot=+this.value;rHB()"/></div></div></div>';
      body+='<div class="cd"><div class="ct">Land cost \u2014 suggested vs actual</div><div class="f" style="margin-bottom:1rem"><label>Actual land cost paid (\u00a3)</label><input type="number" value="'+(HB.land.actual||'')+'" step="10000" placeholder="Enter land cost paid" oninput="HB.land.actual=+this.value;rHB()" onchange="HB.land.actual=+this.value;rHB()"/></div><div class="lc"><div class="lb calc"><div class="lbl2">Suggested land value</div><div class="lbv" style="color:var(--gn)">'+(res.res>0?F(res.res):'Negative')+'</div><div class="lbs">Residual after costs + '+HB.land.profPct+'% profit</div></div><div style="text-align:center"><div class="gbdg '+(gs==='good'?'gg':gs==='marginal'?'gm':'gb')+'">'+(gs==='good'?'\u2713 Good value':gs==='marginal'?'\u26a0 Marginal':'\u2717 Overpriced')+'</div><div style="font-size:10px;color:var(--mu);margin-top:4px">'+(landGap>=0?'Under':'Over')+' by</div><div style="font-family:\'Cormorant Garamond\',serif;font-size:1.2rem;font-weight:600;color:'+(gs==='good'?'var(--gn)':'var(--rd)')+'">'+(actualLand>0?F(Math.abs(landGap)):'\u2014')+'</div></div><div class="lb '+(actualLand>0?(gs==='good'?'ok':'over'):'')+'"><div class="lbl2">Actual land cost</div><div class="lbv" style="color:'+(actualLand>0?(gs==='good'?'var(--gn)':'var(--rd)'):'var(--mu)')+'">'+(actualLand>0?F(actualLand):'Not entered')+'</div><div class="lbs">'+(actualLand>0&&hbt.u>0?F(Math.round(actualLand/hbt.u))+' per plot':' Enter above')+'</div></div></div>'+(actualLand>0?'<div style="background:'+gbg+';border:1px solid '+gbr+';border-radius:6px;padding:.65rem .9rem;font-size:11px;font-weight:500;color:'+gbr+';margin-bottom:.85rem">'+gapMsg+'</div>':'')+'<div class="fr"><span class="fl">Total GDV</span><span class="fv" style="color:var(--bl)">'+F(hbt.gdv)+'</span></div><div class="fr"><span class="fl">Less: build cost</span><span class="fv">('+F(hbt.b)+')</span></div><div class="fr"><span class="fl">Less: infrastructure</span><span class="fv">('+F(res.inf)+')</span></div><div class="fr"><span class="fl">Less: sales & marketing ('+HB.land.sMktPct+'%)</span><span class="fv">('+F(res.sM)+')</span></div><div class="fr"><span class="fl">Less: agent fees ('+HB.land.agentPct+'%)</span><span class="fv">('+F(res.ag)+')</span></div><div class="fr"><span class="fl">Less: target profit ('+HB.land.profPct+'%)</span><span class="fv">('+F(res.pr)+')</span></div><div class="fr" style="border-top:2px solid var(--bd);margin-top:5px;padding-top:9px"><span class="fl" style="font-weight:500">Suggested land value</span><span class="fv" style="color:'+(res.res>0?'var(--gn)':'var(--rd)')+';font-size:13px">'+F(Math.max(0,res.res))+'</span></div>'+(hbt.u>0?'<div class="fr"><span class="fl" style="font-size:10px">Per plot</span><span class="fv" style="font-size:10px">'+F(Math.round(Math.max(0,res.res)/hbt.u))+'/plot</span></div>':'')+'</div>';
    }
  }
  if(hbTab===4){body+=renderMXInline('hb');}
  document.getElementById('v2').innerHTML=wrap('Housebuilder Platform','ft\u00b2/m\u00b2 rate bands \u00b7 Spec uplifts \u00b7 Fee calculator \u00b7 GDV matrix \u00b7 Land value',metrics+subTabs+body,2,'<button class="bg" onclick="hbCostPDF()">Cost Plan PDF</button><button class="bg" onclick="hbFeePDF()">Fee PDF</button><button class="bg" onclick="hbApprPDF()">Appraisal PDF</button>');
}
function rFS(){
  const t=fsCalc();
  const vc=t.viab==='good'?'var(--gn)':t.viab==='marginal'?'var(--g)':'var(--rd)';
  const sc=t.lvS==='green'?'var(--gn)':t.lvS==='amber'?'var(--g)':'var(--rd)';
  const scb=t.lvS==='green'?'rgba(151,196,89,.1)':t.lvS==='amber'?'rgba(186,117,23,.1)':'rgba(224,82,82,.1)';
  const lvi=t.lvS==='green'?'\u2705':t.lvS==='amber'?'\u26a0\ufe0f':'\u0001f6a8';
  const lm=LOC[FS.spec.loc||'national'].m;
  const fTabs=['1. Site','2. Planning','3. Build','4. GDV & Land','5. Programme','6. Finance','Materials'];
  let h='<div class="ms"><div class="mc"><div class="ml">Units</div><div class="mv">'+t.tU+'</div></div><div class="mc"><div class="ml">GDV</div><div class="mv bl">'+F(t.gdv)+'</div></div><div class="mc"><div class="ml">Land value</div><div class="mv" style="color:'+sc+'">'+F(Math.max(0,t.lRes))+'</div></div><div class="mc"><div class="ml">Total finance</div><div class="mv rd">'+F(t.totFin)+'</div></div><div class="mc"><div class="ml">Net profit</div><div class="mv" style="color:'+vc+'">'+F(t.net)+'</div></div><div class="mc"><div class="ml">Profit on GDV</div><div class="mv" style="color:'+vc+'">'+t.pog.toFixed(1)+'%</div></div></div><div style="background:'+scb+';border:1px solid '+sc+';border-radius:6px;padding:.6rem .9rem;margin-bottom:.9rem;font-size:11px;display:flex;align-items:center;gap:7px">'+lvi+' <span style="color:'+sc+';font-weight:500">'+(t.lvS==='green'?'Land value within expected range':'Land value ('+F(Math.round(t.lPha))+'/ha) '+(t.lvS==='amber'?'below':'critically below')+' benchmark')+'</span></div><div style="display:flex;gap:0;border:1px solid var(--bd);border-radius:6px;overflow:hidden;margin-bottom:.9rem;flex-wrap:wrap">'+fTabs.map((l,i)=>{const v=['site','plan','build','gdv','prog','fin','mx'][i];return'<button onclick="FS.tab=\''+v+'\';rFS()" style="flex:1;min-width:50px;padding:7px 3px;font-size:10px;font-weight:500;letter-spacing:.03em;text-transform:uppercase;background:'+(FS.tab===v?'var(--g)':'transparent')+';color:'+(FS.tab===v?'#111':'var(--mu)')+';border:none;cursor:pointer;font-family:\'DM Sans\',sans-serif;border-right:1px solid var(--bd)">'+l+'</button>';}).join('')+'</div>';
  if(FS.tab==='site'){h+='<div class="cd"><div class="ct">Site details</div><div class="g2"><div class="f"><label>Site name</label><input value="'+FS.site.name+'" onchange="FS.site.name=this.value"/></div><div class="f"><label>Postcode</label><input value="'+FS.site.pc+'" onchange="FS.site.pc=this.value"/></div><div class="f"><label>Site area (ha)</label><input type="number" value="'+FS.site.ha+'" step=".1" onchange="FS.site.ha=+this.value;rFS()"/></div><div class="f"><label>Planning status</label><select onchange="FS.site.plan=this.value;rFS()"><option value="full"'+(FS.site.plan==='full'?' selected':'')+'>Full planning</option><option value="outline"'+(FS.site.plan==='outline'?' selected':'')+'>Outline only</option><option value="none"'+(FS.site.plan==='none'?' selected':'')+'>No planning</option></select></div><div class="f"><label>Site type</label><select onchange="FS.site.type=this.value;rFS()"><option value="greenfield"'+(FS.site.type==='greenfield'?' selected':'')+'>Greenfield</option><option value="brownfield"'+(FS.site.type==='brownfield'?' selected':'')+'>Brownfield</option><option value="urban infill"'+(FS.site.type==='urban infill'?' selected':'')+'>Urban infill</option></select></div></div></div>';}
  if(FS.tab==='plan'){const dn={urban:45,suburban:30,rural:16}[FS.plan.set];h+='<div class="cd"><div class="ct">Planning & mix</div><div class="tgl">Setting</div><div class="trow">'+['urban','suburban','rural'].map(v=>'<div class="tog'+(FS.plan.set===v?' on':'')+'" onclick="FS.plan.set=\''+v+'\';rFS()">'+v.charAt(0).toUpperCase()+v.slice(1)+'</div>').join('')+'</div><div class="ib">Suggested units for '+FS.site.ha+'ha: ~<strong>'+Math.round(FS.site.ha*dn)+'</strong></div><div class="g2" style="margin-bottom:.75rem"><div class="f"><label>Affordable %</label><input type="number" value="'+FS.plan.aff+'" min="0" max="60" onchange="FS.plan.aff=+this.value;rFS()"/></div><div class="f"><label>CIL rate (\u00a3/m\u00b2)</label><input type="number" value="'+FS.plan.cil+'" step="5" onchange="FS.plan.cil=+this.value;rFS()"/></div></div><div class="tgl">BNG</div><div class="trow"><div class="tog'+(FS.plan.bng==='onsite'?' on':'')+'" onclick="FS.plan.bng=\'onsite\';rFS()">On-site</div><div class="tog'+(FS.plan.bng==='offsite'?' on':'')+'" onclick="FS.plan.bng=\'offsite\';rFS()">Off-site</div></div></div><div class="cd"><div class="ct">House type mix ('+t.tMkt+' mkt \u00b7 '+t.tAf+' aff \u00b7 '+t.tU+' total)</div><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="background:rgba(255,255,255,.05);padding:6px 8px;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase">Type</th><th style="background:rgba(255,255,255,.05);padding:6px 8px;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase;text-align:right">GIA</th><th style="background:rgba(255,255,255,.05);padding:6px 8px;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase;text-align:right">Mkt</th><th style="background:rgba(255,255,255,.05);padding:6px 8px;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase;text-align:right">Aff</th><th style="background:rgba(255,255,255,.05);padding:6px 8px;font-size:10px;font-weight:500;color:var(--mu);border-bottom:1px solid var(--bd);text-transform:uppercase;text-align:right">Mkt price</th></tr></thead><tbody>'+FS.mix.map((m,i)=>'<tr><td style="padding:6px 8px;font-size:11px;color:#ccc;border-bottom:1px solid rgba(184,150,78,.05)"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(m.en?'checked':'')+' onchange="FS.mix['+i+'].en=this.checked;rFS()" style="accent-color:var(--g);width:12px;height:12px"/> '+m.l+'</label></td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid rgba(184,150,78,.05)">'+m.gia+'m\u00b2</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid rgba(184,150,78,.05)"><input class="ni" type="number" value="'+m.mkt+'" onchange="FS.mix['+i+'].mkt=+this.value;rFS()" style="width:50px"/></td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid rgba(184,150,78,.05)"><input class="ni" type="number" value="'+m.af+'" onchange="FS.mix['+i+'].af=+this.value;rFS()" style="width:50px"/></td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid rgba(184,150,78,.05)"><input class="ni" type="number" value="'+(FS.px[i]?.mkt||0)+'" step="5000" onchange="FS.px['+i+']={mkt:+this.value,af:Math.round(+this.value*.5)};rFS()" style="width:80px"/></td></tr>').join('')+'</tbody></table></div>';}
  if(FS.tab==='build'){
    h+='<div class="cd"><div class="ct">Location</div><div class="tgl">Location premium</div><div class="trow">'+Object.entries(LOC).map(([k,v])=>'<div class="tog'+((FS.spec.loc||'national')===k?' on':'')+'" onclick="FS.spec.loc=\''+k+'\';rFS()">'+v.l+'</div>').join('')+'</div></div><div class="cd"><div class="ct">Pricing method</div><div class="trow"><div class="tog'+(FS.spec.useFt2?' on':'')+'" onclick="FS.spec.useFt2=true;rFS()">\u00a3/ft\u00b2 all-in</div><div class="tog'+(!FS.spec.useFt2?' on':'')+'" onclick="FS.spec.useFt2=false;rFS()">Elemental rates</div></div></div>';
    if(FS.spec.useFt2){const rts=FT2R.map(r=>{const m2=Math.round(r*FT2*lm),tot=FS.mix.filter(m=>m.en).reduce((s,m)=>{const b=m.gia*r*FT2*lm,p=b*(FS.pre/100),c=(b+p)*(FS.con/100);return s+(b+p+c)*(m.mkt+m.af);},0);return{r,m2,tot,on:r===FS.spec.ft2};});h+='<div class="cd"><div class="ct">Select build rate (\u00a3/ft\u00b2)</div><div class="rate-bands">'+rts.map(r=>'<div class="rb'+(r.on?' on':'')+'" onclick="FS.spec.ft2='+r.r+';rFS()"><div class="rb-ft2">\u00a3'+r.r+'/ft\u00b2</div><div class="rb-m2">\u2248 \u00a3'+r.m2+'/m\u00b2</div><div class="rb-inc">'+F(r.tot)+' total</div></div>').join('')+'</div></div>';}
    else{h+='<div class="cd"><div class="ct">Elemental spec</div><div class="tgl">Walls</div><div class="trow">'+['brick','stone','render'].map(v=>'<div class="tog'+(FS.spec.wall===v?' on':'')+'" onclick="FS.spec.wall=\''+v+'\';rFS()">'+v.charAt(0).toUpperCase()+v.slice(1)+' \u00a3'+WR[v]+'/m\u00b2</div>').join('')+'</div><div class="tgl">Roof</div><div class="trow">'+['concrete','slate','stone'].map(v=>'<div class="tog'+(FS.spec.roof===v?' on':'')+'" onclick="FS.spec.roof=\''+v+'\';rFS()">'+(v==='concrete'?'Concrete':v==='slate'?'Nat slate':'Stone')+' \u00a3'+RR[v]+'/m\u00b2</div>').join('')+'</div><div class="tgl">Ground</div><div class="trow">'+['good','medium','poor'].map(v=>'<div class="tog'+(FS.spec.ground===v?' on':'')+'" onclick="FS.spec.ground=\''+v+'\';rFS()">'+(v==='good'?'Good':v==='medium'?'Medium':'Poor/piles')+' \u00a3'+GR[v]+'/m\u00b2</div>').join('')+'</div></div>';}
    h+='<div class="cd"><div class="ct">Build cost summary</div><div class="fr"><span class="fl">Build cost</span><span class="fv">'+F(t.tB)+'</span></div><div class="fr"><span class="fl">CIL + BNG + infrastructure</span><span class="fv">'+F(t.cil+t.bng+t.infra)+'</span></div><div class="fr"><span class="fl">Professional fees ('+FS.pFees+'%)</span><span class="fv">'+F(t.pF)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total development cost</span><span class="fv" style="color:var(--g)">'+F(t.tC)+'</span></div></div>';
  }
  if(FS.tab==='gdv'){
    const vGapOk=t.vGap>=0,vGapM=t.vGap>-Math.max(1,t.lRes)*.15;
    const gs2=vGapOk?'good':vGapM?'marginal':'bad';
    const gbg2=gs2==='good'?'rgba(151,196,89,.1)':gs2==='marginal'?'rgba(186,117,23,.1)':'rgba(224,82,82,.1)';
    const gbr2=gs2==='good'?'var(--gn)':gs2==='marginal'?'var(--g)':'var(--rd)';
    h+='<div class="cd" id="landInputCard"><div class="ct">Land inputs</div><div class="g3"><div class="f"><label>Vendor asking price (\u00a3)</label><input type="number" id="fslV" value="'+FSL.vendAsk+'" step="10000" min="0" oninput="FSL.vendAsk=+this.value;updateLC()" onchange="FSL.vendAsk=+this.value;updateLC()"/></div><div class="f"><label>Target profit on GDV %</label><input type="number" id="fslP" value="'+FSL.prof+'" step="1" min="5" max="35" oninput="FSL.prof=+this.value;updateLC()" onchange="FSL.prof=+this.value;updateLC()"/></div><div class="f"><label>Sales & marketing %</label><input type="number" id="fslS" value="'+FSL.sMkt+'" step="0.5" min="0" max="10" oninput="FSL.sMkt=+this.value;updateLC()" onchange="FSL.sMkt=+this.value;updateLC()"/></div></div></div><div id="lcPanel"></div><div id="lbPanel"></div>';
    setTimeout(updateLC,0);
  }
  if(FS.tab==='prog'){h+='<div class="cd"><div class="ct">Programme dates</div><div class="g2"><div class="f"><label>Land purchase date</label><input type="date" value="'+FS.prog.land+'" onchange="FS.prog.land=this.value;rFS()"/></div><div class="f"><label>Construction start</label><input type="date" value="'+FS.prog.conStart+'" onchange="FS.prog.conStart=this.value;rFS()"/></div><div class="f"><label>Construction duration (months)</label><input type="number" value="'+FS.prog.conMths+'" min="1" max="120" onchange="FS.prog.conMths=+this.value;rFS()"/></div><div class="f"><label>Final sale / loan end</label><input type="date" value="'+FS.prog.salesEnd+'" onchange="FS.prog.salesEnd=this.value;rFS()"/></div></div><div class="fr"><span class="fl">Build period</span><span class="fv">'+t.bMths+' months</span></div><div class="fr"><span class="fl">Sales tail after PC</span><span class="fv">'+t.tMths+' months</span></div><div class="fr"><span class="fl">Land loan period</span><span class="fv">'+t.lMths+' months</span></div></div>';}
  if(FS.tab==='fin'){
    const svgW=600,svgH=80;
    const pts=t.md.map((d,i)=>{const x=(i/(t.bMths-1||1))*svgW,y=svgH-(d.cum/t.bLoan)*svgH;return x+','+y;}).join(' ');
    const areaD='M0,'+svgH+' '+t.md.map((d,i)=>{const x=(i/(t.bMths-1||1))*svgW,y=svgH-(d.cum/t.bLoan)*svgH;return'L'+x+','+y;}).join(' ')+' L'+svgW+','+svgH+' Z';
    const showM=Math.min(t.bMths,16);
    h+='<div class="cd"><div class="ct">Finance inputs</div><div class="g2"><div class="f"><label>Land loan LTV %</label><input type="number" value="'+FS.fin.lLTV+'" step="5" onchange="FS.fin.lLTV=+this.value;rFS()"/></div><div class="f"><label>Land loan rate % p.a.</label><input type="number" value="'+FS.fin.lRate+'" step=".25" onchange="FS.fin.lRate=+this.value;rFS()"/></div><div class="f"><label>Build loan LTC %</label><input type="number" value="'+FS.fin.bLTC+'" step="5" onchange="FS.fin.bLTC=+this.value;rFS()"/></div><div class="f"><label>Build loan rate % p.a.</label><input type="number" value="'+FS.fin.bRate+'" step=".25" onchange="FS.fin.bRate=+this.value;rFS()"/></div></div></div><div class="cd"><div class="ct">Land loan \u2014 detailed interest schedule</div><div class="ib">Drawn in full on land purchase, repaid on final plot sale.</div><div class="fr"><span class="fl">Land value (residual)</span><span class="fv">'+F(t.lVal)+'</span></div><div class="fr"><span class="fl">Loan amount ('+FS.fin.lLTV+'% LTV)</span><span class="fv">'+F(t.lLoan)+'</span></div><div class="fr"><span class="fl">Monthly interest cost</span><span class="fv" style="color:var(--rd)">'+F(t.lMoI)+'/month</span></div><div class="fr"><span class="fl" style="font-weight:500">Total land interest payable</span><span class="fv" style="color:var(--rd);font-size:13px">'+F(t.lTotI)+'</span></div><div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:.5rem">'+Array.from({length:Math.min(t.lMths,24)},(_,i)=>'<div style="background:rgba(224,82,82,.1);border:1px solid rgba(224,82,82,.2);border-radius:3px;padding:3px 5px;text-align:center;min-width:46px"><div style="font-size:9px;color:var(--mu)">Mo '+(i+1)+'</div><div style="font-size:10px;color:var(--rd);font-weight:500">'+FK(t.lMoI)+'</div></div>').join('')+(t.lMths>24?'<div style="padding:3px 7px;font-size:10px;color:var(--mu);align-self:center">+'+(t.lMths-24)+' more</div>':'')+'</div></div><div class="cd"><div class="ct">Build loan \u2014 S-curve drawdown & monthly interest</div><div class="ib">Build loan drawn progressively following an S-curve. After PC the full balance remains until plot sales repay it.</div><div class="fr"><span class="fl">Construction phase interest ('+t.bMths+'mo S-curve)</span><span class="fv">'+F(t.bInt)+'</span></div><div class="fr"><span class="fl">Sales tail interest ('+t.tMths+'mo full balance)</span><span class="fv">'+F(t.tInt)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total build interest payable</span><span class="fv" style="color:var(--rd);font-size:13px">'+F(t.totBInt)+'</span></div><div style="font-size:10px;color:var(--mu);margin:.6rem 0 4px;text-transform:uppercase;letter-spacing:.06em">S-curve drawdown \u2014 '+t.bMths+'-month build</div><div class="scw"><svg viewBox="0 0 '+svgW+' '+svgH+'" preserveAspectRatio="none" style="width:100%;height:100%"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#378ADD" stop-opacity=".3"/><stop offset="100%" stop-color="#378ADD" stop-opacity=".02"/></linearGradient></defs><path d="'+areaD+'" fill="url(#sg)"/><polyline points="'+pts+'" fill="none" stroke="#378ADD" stroke-width="2"/></svg></div><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--mu);margin-bottom:.6rem"><span>Start</span><span>\u2190 '+t.bMths+'mo build \u2192</span><span>PC</span></div><div class="mgd">'+t.md.slice(0,showM).map(d=>'<div class="mc2"><div style="font-size:9px;color:var(--mu)">Mo '+d.m+'</div><div style="font-size:10px;color:var(--bl);font-weight:500">'+FK(d.d)+'</div><div style="font-size:9px;color:var(--bl)">'+FK(d.cum)+' drn</div><div style="font-size:9px;color:var(--mu)">'+FK(d.int)+' int</div></div>').join('')+(t.bMths>showM?'<div style="padding:3px 7px;font-size:10px;color:var(--mu);align-self:center">+'+(t.bMths-showM)+' more</div>':'')+'</div><div style="margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--bd)"><div class="fr"><span class="fl">Land finance total</span><span class="fv" style="color:var(--rd)">'+F(t.lTotI)+'</span></div><div class="fr"><span class="fl">Build finance total</span><span class="fv" style="color:var(--rd)">'+F(t.totBInt)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total finance cost</span><span class="fv" style="color:var(--rd);font-size:13px">'+F(t.totFin)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Net profit (after all finance)</span><span class="fv" style="color:'+vc+';font-size:13px">'+F(t.net)+'</span></div><div class="fr"><span class="fl">Profit on GDV</span><span class="fv" style="color:'+vc+'">'+t.pog.toFixed(1)+'%</span></div><div style="margin-top:.65rem"><div class="vb"><div class="vf" style="width:'+Math.min(100,Math.max(0,t.pog/30*100))+'%;background:'+vc+'"></div></div><div style="font-size:11px;font-weight:500;margin-top:6px;color:'+vc+'">'+(t.viab==='good'?'\u2705 Viable \u226520% on GDV':t.viab==='marginal'?'\u26a0\ufe0f Marginal 15\u201320%':'\u0001f6a8 Not viable <15%')+'</div></div></div></div>';
  }
  if(FS.tab==='mx'){h+=renderMXInline('fs');}
  document.getElementById('v3').innerHTML=wrap('Development Feasibility Tool','ft\u00b2 rates \u00b7 Location premium \u00b7 Vendor land check \u00b7 S-curve finance',h,3,'<button class="bg" onclick="fsPDF()">Full Appraisal PDF</button><button class="bg" onclick="fsCSV()">CSV</button>');
}
function updateLC(){
  const t=fsCalc();
  const sc2=t.lvS==='green'?'var(--gn)':t.lvS==='amber'?'var(--g)':'var(--rd)';
  const vGapOk=t.vGap>=0,vGapM=t.vGap>-Math.max(1,t.lRes)*.15;
  const gs=vGapOk?'good':vGapM?'marginal':'bad';
  const gm=vGapOk?'\u2705 Vendor asking '+F(Math.abs(t.vGap))+' BELOW residual':vGapM?'\u26a0\ufe0f Vendor asking '+F(Math.abs(t.vGap))+' above residual \u2014 marginal':'\u0001f6a8 Vendor asking '+F(Math.abs(t.vGap))+' above residual \u2014 not viable';
  const gbg=gs==='good'?'rgba(151,196,89,.1)':gs==='marginal'?'rgba(186,117,23,.1)':'rgba(224,82,82,.1)';
  const gbr=gs==='good'?'var(--gn)':gs==='marginal'?'var(--g)':'var(--rd)';
  const lcp=document.getElementById('lcPanel'),lbp=document.getElementById('lbPanel');
  if(lcp)lcp.innerHTML='<div class="lc"><div class="lb calc"><div class="lbl2">Residual land value</div><div class="lbv" style="color:var(--gn)">'+F(Math.max(0,t.lRes))+'</div><div class="lbs">What the numbers support at '+FSL.prof+'% profit</div></div><div style="text-align:center"><div class="gbdg '+(gs==='good'?'gg':gs==='marginal'?'gm':'gb')+'" style="margin-bottom:5px">'+(gs==='good'?'\u2713 Under residual':gs==='marginal'?'\u26a0 Marginal':'\u2717 Overpriced')+'</div><div style="font-size:10px;color:var(--mu)">'+(t.vGap>=0?'Under':'Over')+' by</div><div style="font-family:\'Cormorant Garamond\',serif;font-size:1.2rem;font-weight:600;color:'+gbr+'">'+F(Math.abs(t.vGap))+'</div></div><div class="lb '+(t.vGap>=0?'ok':'over')+'"><div class="lbl2">Vendor asking price</div><div class="lbv" style="color:'+gbr+'">'+F(FSL.vendAsk)+'</div><div class="lbs">'+(t.lRes>0?Math.abs((t.vGap/t.lRes)*100).toFixed(1):'0')+'% '+(t.vGap>=0?'below':'above')+' residual</div></div></div><div style="background:'+gbg+';border:1px solid '+gbr+';border-radius:6px;padding:.65rem .9rem;font-size:11px;font-weight:500;color:'+gbr+';margin-bottom:.85rem">'+gm+'</div>';
  if(lbp)lbp.innerHTML='<div class="cd"><div class="ct">Residual land value \u2014 full calculation</div><div class="fr"><span class="fl">GDV</span><span class="fv" style="color:var(--bl)">'+F(t.gdv)+'</span></div><div class="fr"><span class="fl">Less: total development cost</span><span class="fv">('+F(t.tC)+')</span></div><div class="fr"><span class="fl">Less: sales & marketing ('+FSL.sMkt+'%)</span><span class="fv">('+F(t.sM)+')</span></div><div class="fr"><span class="fl">Less: agent fees ('+FS.agent+'%)</span><span class="fv">('+F(t.ag)+')</span></div><div class="fr"><span class="fl">Less: target profit ('+FSL.prof+'%)</span><span class="fv">('+F(t.tP)+')</span></div><div class="fr" style="border-top:2px solid var(--bd);margin-top:5px;padding-top:9px"><span class="fl" style="font-weight:500">Residual land value</span><span class="fv" style="color:'+sc2+';font-size:13px">'+F(Math.max(0,t.lRes))+'</span></div><div class="fr"><span class="fl" style="font-size:10px">Land per hectare</span><span class="fv" style="font-size:10px">'+F(Math.round(t.lPha))+'/ha</span></div><div class="fr"><span class="fl" style="font-size:10px">Vendor asking</span><span class="fv" style="font-size:10px">'+F(FSL.vendAsk)+'</span></div><div class="fr"><span class="fl" style="font-size:10px">Gap</span><span class="fv" style="font-size:10px;color:'+(t.vGap>=0?'var(--gn)':'var(--rd)')+'">'+( t.vGap>=0?'+':'')+F(t.vGap)+'</span></div></div>';
}
function wrap(title,desc,body,idx,btns){const demoBtn=idx>0?'<button class="demo-launch-btn" onclick="startDemo('+idx+')">\u25b6 Demo</button>':'';return'<div style="background:var(--d2);border:1px solid var(--bd);border-radius:8px;overflow:hidden"><div style="padding:.9rem 1.1rem;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:7px"><div><div style="font-family:\'Cormorant Garamond\',serif;font-size:1.2rem;font-weight:600">'+title+'</div><div style="font-size:.73rem;color:var(--mu)">'+desc+'</div></div><div style="display:flex;gap:6px;align-items:center">'+demoBtn+'<button class="bo" onclick="gv(0)">\u2190 Guide</button></div></div><div style="padding:1.1rem">'+body+'</div><div class="pr"><span class="prl">Export:</span>'+btns+'</div></div>';}
function opdf(c,title){const html='\u003chtml\u003e\u003chead\u003e<title>'+title+'</title>\u003cstyle\u003ebody{font-family:Georgia,serif;color:#2c2c2a;max-width:860px;margin:40px auto;padding:0 20px}h1{font-size:20px;margin:0 0 3px;color:#1a1a18}h2{font-size:12px;font-weight:normal;color:#6b6960;margin:0 0 13px}h3{font-size:12px;margin:14px 0 5px}.co{font-size:22px;color:#b8964e;letter-spacing:.1em;font-weight:700;margin-bottom:3px}.cos{font-size:11px;color:#888;letter-spacing:.15em;margin-bottom:18px}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#1a1a18;color:#b8964e;padding:7px 9px;font-size:10px;text-align:left;letter-spacing:.07em}td{border-bottom:.5px solid #e8e3da;padding:6px 9px;font-size:11px}td:last-child{text-align:right}.tr{font-weight:bold;background:#f5f0e8}.note{font-size:10px;color:#888;margin-top:12px;border-top:1px solid #e8e3da;padding-top:9px}.vd{font-size:13px;font-weight:bold;margin-top:10px}<\/style><\/head>\u003cbody\u003e<div class="co">SIGNATURE CONSTRUCTION PROJECTS LTD</div><div class="cos">Quantity Surveying Consultancy</div>'+c+'<\/body><\/html>';const w=window.open('','_blank');if(w){w.document.write(html);w.document.close();w.onload=()=>w.print();}}
function spCP(){const t=spCalc();let r='';SP.secs.forEach(s=>{r+='<tr style="background:#f5f0e8"><td colspan="4" style="font-weight:bold;font-size:10px;text-transform:uppercase;color:#888">'+s.lbl+' \u2014 '+F(s.tot||0)+'</td></tr>';s.its.forEach(it=>{r+='<tr><td>'+it.n+'</td><td style="text-align:right">'+it.q+' '+it.u+'</td><td style="text-align:right">\u00a3'+Number(it.r).toLocaleString('en-GB')+'</td><td>'+F(it.tot||0)+'</td></tr>';});});opdf('<h1>'+SP.proj+'</h1><h2>Cost Plan \u00b7 RIBA Stage '+SP.stage+' \u00b7 '+TD()+' \u00b7 Client: '+SP.client+'</h2><table><thead><tr><th>Element</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead><tbody>'+r+'<tr class="tr"><td colspan="3">Grand total</td><td>'+F(t.grand)+'</td></tr></tbody></table><p class="note">GIA: '+SP.gia+'m\u00b2 \u00b7 Cost/m\u00b2: '+F(t.m2)+' \u00b7 Prepared by Signature Construction Projects Ltd</p>','Cost Plan');}
function spFee(){const t=spCalc();const sv=[{n:'Feasibility & cost appraisal',p:.4},{n:'Stage 2 cost plan',p:.5},{n:'Stage 3 cost plan',p:.45},{n:'Bill of quantities',p:.75},{n:'Tender analysis',p:.3},{n:'Final account',p:.4}];const tot=sv.reduce((s,x)=>s+t.grand*(x.p/100),0);opdf('<h1>Fee Proposal</h1><h2>'+SP.proj+' \u00b7 '+SP.client+' \u00b7 '+TD()+'</h2><table><thead><tr><th>Service</th><th>Rate</th><th>Fee (ex VAT)</th></tr></thead><tbody>'+sv.map(x=>'<tr><td>'+x.n+'</td><td>'+x.p.toFixed(2)+'%</td><td>'+F(t.grand*(x.p/100))+'</td></tr>').join('')+'<tr class="tr"><td colspan="2">Total (ex VAT)</td><td>'+F(tot)+'</td></tr><tr class="tr"><td colspan="2">VAT (20%)</td><td>'+F(tot*.2)+'</td></tr><tr class="tr"><td colspan="2">Total (inc VAT)</td><td>'+F(tot*1.2)+'</td></tr></tbody></table><p class="note">Prepared by Signature Construction Projects Ltd</p>','Fee Proposal');}
function spBvA(){const t=spCalc();let r='';const tA=SP.secs.reduce((s,sec)=>s+sec.its.reduce((ss,it)=>ss+(+it.a||0),0),0);SP.secs.forEach(s=>{s.its.forEach(it=>{const b2=it.tot||0,a=+it.a||0,v=a-b2;r+='<tr><td>'+it.n+'</td><td>'+F(b2)+'</td><td>'+F(a)+'</td><td>'+F(b2-a)+'</td><td style="color:'+(v>0?'#C0392B':'#27500A')+'">'+( v>0?'+':'')+F(v)+'</td></tr>';});});opdf('<h1>Budget vs Actual</h1><h2>'+SP.proj+' \u00b7 '+TD()+'</h2><table><thead><tr><th>Element</th><th>Budget</th><th>Actual</th><th>Remaining</th><th>Variance</th></tr></thead><tbody>'+r+'<tr class="tr"><td>Total</td><td>'+F(t.grand)+'</td><td>'+F(tA)+'</td><td>'+F(t.grand-tA)+'</td><td style="color:'+(tA>t.grand?'#C0392B':'#27500A')+'">'+( tA>t.grand?'+':'')+F(tA-t.grand)+'</td></tr></tbody></table><p class="note">Prepared by Signature Construction Projects Ltd</p>','BvA');}
function hbCostPDF(){const hbt=hbTot(),up=hbSpecUplift(),baseFt2=hbBaseFt2();let r=HB.types.filter(t=>t.en&&t.n>0).map(t=>{const c=hbCostUnit(t.gia),rm2=Math.round(hbRateM2());return'<tr><td>'+t.l+'</td><td>'+t.gia+'m\u00b2</td><td>'+t.n+'</td><td>\u00a3'+rm2+'/m\u00b2</td><td>'+F(c)+'</td><td>'+F(c*t.n)+'</td></tr>';}).join('');opdf('<h1>Housebuilder Cost Plan</h1><h2>'+hbt.u+' plots \u00b7 \u00a3'+baseFt2+'/ft\u00b2 base + \u00a3'+up.total+'/m\u00b2 spec uplifts \u00b7 '+TD()+'</h2><table><thead><tr><th>Type</th><th>GIA</th><th>Plots</th><th>Rate/m\u00b2</th><th>Cost/plot</th><th>Total</th></tr></thead><tbody>'+r+'<tr class="tr"><td colspan="5">Total build cost</td><td>'+F(hbt.b)+'</td></tr></tbody></table><p class="note">Prelims '+HB.pre+'% \u00b7 Contingency '+HB.con+'% \u00b7 Spec: '+HB.wall+' walls, '+HB.roof+' roof, '+HB.ground+' ground \u00b7 Prepared by Signature Construction Projects Ltd</p>','HB Cost Plan');}
function hbFeePDF(){const hbt=hbTot();const sel=SVCS.filter(s=>s.sel);const totPct=sel.reduce((t,s)=>t+s.pct,0);const totFee=hbt.b*(totPct/100);let r=sel.map(s=>'<tr><td>'+s.name+'</td><td>'+s.cat+'</td><td>'+FP(s.pct)+'</td><td>'+F(hbt.b*(s.pct/100))+'</td></tr>').join('');opdf('<h1>Fee Proposal</h1><h2>Build cost: '+F(hbt.b)+' \u00b7 '+hbt.u+' plots \u00b7 '+TD()+'</h2><table><thead><tr><th>Service</th><th>Phase</th><th>Rate %</th><th>Fee (ex VAT)</th></tr></thead><tbody>'+r+'<tr class="tr"><td colspan="2">Total fee % of build cost</td><td>'+FP(totPct)+'</td><td>'+F(totFee)+'</td></tr><tr class="tr"><td colspan="3">VAT (20%)</td><td>'+F(totFee*.2)+'</td></tr><tr class="tr"><td colspan="3">Total (inc VAT)</td><td>'+F(totFee*1.2)+'</td></tr></tbody></table><p class="note">Prepared by Signature Construction Projects Ltd</p>','HB Fee Proposal');}
function hbApprPDF(){const hbt=hbTot();const res=hbResidual(hbt);const active=HB.types.filter(t=>t.en&&t.n>0);let spRows=active.map(t=>{const bc=hbCostUnit(t.gia),sug=Math.round(bc*1.35/5000)*5000,sp=t.ovSp?t.sp:sug;return'<tr><td>'+t.l+'</td><td>'+t.n+'</td><td>'+F(sp)+'</td><td>'+F(bc)+'</td><td>'+F((sp-bc)*t.n)+'</td><td>'+F(sp*t.n)+'</td></tr>';}).join('');const vc2=res.res>0?'#27500A':'#C0392B';opdf('<h1>Development Appraisal</h1><h2>'+hbt.u+' plots \u00b7 '+TD()+'</h2><h3>Sales price matrix</h3><table><thead><tr><th>Type</th><th>Plots</th><th>Sale price</th><th>Build cost</th><th>Total margin</th><th>Line GDV</th></tr></thead><tbody>'+spRows+'<tr class="tr"><td colspan="5">Total GDV</td><td>'+F(hbt.gdv)+'</td></tr></tbody></table><h3>Residual land value</h3><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody><tr><td>Total GDV</td><td style="color:#378ADD;font-weight:bold">'+F(hbt.gdv)+'</td></tr><tr><td>Build cost</td><td>('+F(hbt.b)+')</td></tr><tr><td>Infrastructure</td><td>('+F(res.inf)+')</td></tr><tr><td>Sales & marketing ('+HB.land.sMktPct+'%)</td><td>('+F(res.sM)+')</td></tr><tr><td>Agent fees ('+HB.land.agentPct+'%)</td><td>('+F(res.ag)+')</td></tr><tr><td>Target profit ('+HB.land.profPct+'%)</td><td>('+F(res.pr)+')</td></tr><tr class="tr"><td>Suggested land value</td><td style="color:'+vc2+';font-size:14px">'+F(Math.max(0,res.res))+'</td></tr>'+(HB.land.actual>0?'<tr><td>Actual land cost</td><td>'+F(HB.land.actual)+'</td></tr><tr class="tr"><td>Gap</td><td style="color:'+(res.res-HB.land.actual>=0?'#27500A':'#C0392B')+'">'+(res.res-HB.land.actual>=0?'+':'')+F(res.res-HB.land.actual)+'</td></tr>':'')+'</tbody></table><p class="note">Indicative at feasibility stage \u00b7 Prepared by Signature Construction Projects Ltd</p>','HB Appraisal');}
function fsPDF(){const t=fsCalc();const vc3=t.viab==='good'?'#27500A':t.viab==='marginal'?'#BA7517':'#C0392B';opdf('<h1>Development Feasibility Appraisal</h1><h2>'+FS.site.name+' \u00b7 '+FS.site.pc+' \u00b7 '+FS.site.ha+'ha \u00b7 '+TD()+'</h2><h3>Land value check</h3><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody><tr><td>Residual land value</td><td style="color:#27500A;font-weight:500">'+F(Math.max(0,t.lRes))+'</td></tr><tr><td>Vendor asking price</td><td>'+F(FSL.vendAsk)+'</td></tr><tr class="tr"><td>Gap</td><td style="color:'+(t.vGap>=0?'#27500A':'#C0392B')+';font-weight:500">'+( t.vGap>=0?'+':'')+F(t.vGap)+'</td></tr></tbody></table><h3>Finance</h3><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody><tr><td>Land loan ('+F(t.lLoan)+' @ '+FS.fin.lRate+'% \u00b7 '+t.lMths+' months)</td><td>'+F(t.lTotI)+'</td></tr><tr><td>Build loan S-curve ('+F(t.bLoan)+' @ '+FS.fin.bRate+'% \u00b7 '+t.bMths+'mo + '+t.tMths+'mo tail)</td><td>'+F(t.totBInt)+'</td></tr><tr class="tr"><td>Total finance cost</td><td style="color:#C0392B">'+F(t.totFin)+'</td></tr></tbody></table><h3>Full appraisal</h3><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody><tr><td>Total GDV</td><td style="color:#378ADD;font-weight:bold">'+F(t.gdv)+'</td></tr><tr><td>Build cost + on-costs</td><td>('+F(t.tC)+')</td></tr><tr><td>Land (vendor asking)</td><td>('+F(FSL.vendAsk)+')</td></tr><tr><td>Sales & agent fees</td><td>('+F(t.sM+t.ag)+')</td></tr><tr><td>Total finance</td><td>('+F(t.totFin)+')</td></tr><tr class="tr"><td>Net profit</td><td style="color:'+vc3+';font-size:13px">'+F(t.net)+'</td></tr><tr class="tr"><td>Profit on GDV</td><td style="color:'+vc3+'">'+t.pog.toFixed(1)+'%</td></tr></tbody></table><div class="vd" style="color:'+vc3+'">'+(t.viab==='good'?'VIABLE \u2713':t.viab==='marginal'?'MARGINAL \u26a0':'NOT VIABLE \u2717')+' \u2014 '+t.pog.toFixed(1)+'% on GDV</div><p class="note">Prepared by Signature Construction Projects Ltd \u00b7 '+TD()+'</p>','Feasibility Appraisal');}
function fsCSV(){const t=fsCalc();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['Feasibility Appraisal\nGDV,'+F(t.gdv)+'\nBuild Cost,'+F(t.tB)+'\nLand Residual,'+F(Math.max(0,t.lRes))+'\nVendor Ask,'+F(FSL.vendAsk)+'\nVendor Gap,'+F(t.vGap)+'\nLand Finance,'+F(t.lTotI)+'\nBuild Finance,'+F(t.totBInt)+'\nTotal Finance,'+F(t.totFin)+'\nNet Profit,'+F(t.net)+'\nProfit on GDV,'+t.pog.toFixed(1)+'%\n'],{type:'text/csv'}));a.download='Appraisal.csv';a.click();}

/* EXTENSIONS */
const EXT_TYPES=[
  {id:'single',icon:'\u0001f3e0',name:'Single Storey Rear',range:'\u00a31,800\u2013\u00a33,200/m\u00b2',planning:'pd',pdLimit:'Max 6m detached / 4m semi \u2014 check PD rules',desc:'Ground floor rear extension, typically kitchen/dining'},
  {id:'double',icon:'\u0001f3e2',name:'Double Storey',range:'\u00a31,600\u2013\u00a32,800/m\u00b2',planning:'pp',pdLimit:'Full planning permission required',desc:'Two-storey rear or side extension'},
  {id:'side',icon:'\u2194',name:'Side Return',range:'\u00a32,000\u2013\u00a33,500/m\u00b2',planning:'pd',pdLimit:'Subject to PD limits and Article 4 directions',desc:'Infill of side return passage, often with glazed roof'},
  {id:'loft',icon:'\u25b2',name:'Loft Conversion',range:'\u00a31,400\u2013\u00a32,500/m\u00b2',planning:'pd',pdLimit:'Dormer PD \u2014 40m3 semi/terrace, 50m3 detached',desc:'Conversion of existing roof space to habitable room'},
  {id:'garage',icon:'\u0001f697',name:'Garage Conversion',range:'\u00a3600\u2013\u00a31,200/m\u00b2',planning:'pd',pdLimit:'Usually permitted development',desc:'Conversion of existing integral or attached garage'},
  {id:'basement',icon:'\u25bc',name:'Basement',range:'\u00a32,500\u2013\u00a34,500/m\u00b2',planning:'either',pdLimit:'Often PD \u2014 check local conditions',desc:'New basement or conversion of existing cellar'},
  {id:'orangery',icon:'\u0001f33f',name:'Orangery / Garden Room',range:'\u00a31,500\u2013\u00a32,800/m\u00b2',planning:'pd',pdLimit:'Same PD rules as rear extension',desc:'Part solid, part glazed structure at premium spec'},
];
const SPEC_UP={glazing:{none:0,standard:120,premium:280,structural:480},roof:{standard:0,pitched:150,vaulted:180,lantern:220},finish:{standard:0,mid:150,high:350,luxury:650},heating:{none:0,radiator:80,underfloor:180}};
const EXT_BANDS={budget:{label:'Budget',m2:1600,desc:'Basic spec'},mid:{label:'Mid-range',m2:2200,desc:'Good quality'},high:{label:'High spec',m2:3000,desc:'Premium finishes'},bespoke:{label:'Bespoke',m2:2200,desc:'Your rate'}};
const SVCS_EX=[
  {cat:'Pre-Construction',name:'Feasibility & budget estimate',desc:'Ballpark cost and viability',pct:0.50,sel:true},
  {cat:'Pre-Construction',name:'Planning application support',desc:'Cost info for planning',pct:0.30,sel:false},
  {cat:'Pre-Construction',name:'Detailed cost plan',desc:'Elemental breakdown for tender',pct:0.60,sel:true},
  {cat:'Pre-Construction',name:'Tender analysis & contractor selection',desc:'Evaluate quotes & recommend',pct:0.35,sel:true},
  {cat:'Construction',name:'Contract administration',desc:'JCT Minor Works / HomeOwner',pct:0.80,sel:false},
  {cat:'Construction',name:'Interim valuations',desc:'Monthly progress valuations',pct:0.50,sel:false},
  {cat:'Construction',name:'Variation assessment',desc:'Price any changes',pct:0.35,sel:false},
  {cat:'Post-Construction',name:'Final account',desc:'Agree final sum with contractor',pct:0.40,sel:true},
  {cat:'Post-Construction',name:'Snagging inspection',desc:'Identify defects at completion',pct:0.25,sel:false},
];
const EX={
  type:'single',gia:25,band:'mid',customM2:2200,
  spec:{glazing:'standard',roof:'standard',finish:'standard',heating:'radiator'},
  pre:12,con:8,client:'Mr & Mrs Johnson',proj:'32 Maple Avenue',
  move:{houseVal:450000,targetVal:600000,agentSale:1.5,legal:3500,survey:800,removal:2000},
  actuals:{},
  elems:[
    {n:'Demolition & strip out',m2r:95,fix:0},{n:'Foundations / substructure',m2r:320,fix:0},
    {n:'External walls',m2r:380,fix:0},{n:'Roof structure & covering',m2r:280,fix:0},
    {n:'Glazing & doors',m2r:420,fix:0},{n:'Internal walls & partitions',m2r:120,fix:0},
    {n:'Floor finishes',m2r:180,fix:0},{n:'Wall & ceiling finishes',m2r:140,fix:0},
    {n:'Kitchen / bathroom fittings',m2r:0,fix:8500},{n:'Mechanical & plumbing',m2r:220,fix:0},
    {n:'Electrical & lighting',m2r:160,fix:0},{n:'Heating extension / UFH',m2r:140,fix:0},
    {n:'External works & reinstatement',m2r:85,fix:1200},
  ]
};
function exType(){return EXT_TYPES.find(e=>e.id===EX.type)||EXT_TYPES[0];}
function exBM2(){return EX.band==='bespoke'?EX.customM2:EXT_BANDS[EX.band].m2;}
function exUp(){return(SPEC_UP.glazing[EX.spec.glazing]||0)+(SPEC_UP.roof[EX.spec.roof]||0)+(SPEC_UP.finish[EX.spec.finish]||0)+(SPEC_UP.heating[EX.spec.heating]||0);}
function exEM2(){return exBM2()+exUp();}
function exBC(){const b=exEM2()*EX.gia,p=b*(EX.pre/100),c=(b+p)*(EX.con/100);return{base:b,pre:p,con:c,tot:b+p+c};}
function exET(){return EX.elems.reduce((t,e)=>t+(e.m2r*EX.gia+e.fix),0);}
function calcSDLT(v){if(v<=250000)return 0;let t=0;if(v>250000)t+=Math.min(v-250000,675000)*.05;if(v>925000)t+=Math.min(v-925000,575000)*.10;if(v>1500000)t+=(v-1500000)*.12;return t;}
function planBdg(p){if(p==='pd')return'<span class="plan-badge plan-pd">\u2713 Usually Permitted Development</span>';if(p==='pp')return'<span class="plan-badge plan-pp">! Planning Permission Required</span>';return'<span class="plan-badge plan-either">~ PD or Planning \u2014 check LPA</span>';}
function setEXTab(i){exTab=i;rEX();}
function rEX(){
  const ext=exType(),bc=exBC(),em=exEM2(),up=exUp();
  const met='<div class="ms"><div class="mc"><div class="ml">Type</div><div class="mv" style="font-size:11px">'+ext.icon+' '+ext.name+'</div></div><div class="mc"><div class="ml">Floor area</div><div class="mv">'+EX.gia+'m2</div></div><div class="mc"><div class="ml">Rate</div><div class="mv" style="font-size:12px">L'+em+'/m2</div></div><div class="mc"><div class="ml">Spec uplifts</div><div class="mv" style="font-size:12px;color:'+(up>0?'var(--rd)':'var(--mu)')+'">+'+up+'/m2</div></div><div class="mc"><div class="ml">Build cost</div><div class="mv go">'+F(bc.tot)+'</div></div><div class="mc"><div class="ml">Inc VAT</div><div class="mv" style="font-size:13px">'+F(bc.tot*1.2)+'</div></div></div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2');
  const stabs='<div class="subtabs">'+['Cost Estimate','Elemental Detail','Planning & Regs','VAT Summary','Fee Calculator','Extend vs Move','Budget vs Actual','Materials'].map((l,i)=>{const onclick='data-ctx="ex" data-i='+i+' onclick="window.mxTabClick(this)"';return'<button class="stab'+(m.tab===i?' active':'')+'" '+onclick+'>'+l+'</button>';}).join('')+'</div>';
  let b='';
  if(exTab===0){
    b+='<div class="cd"><div class="ct">Extension type</div><div class="ext-grid">'+EXT_TYPES.map(e=>'<div class="ext-card'+(EX.type===e.id?' on':'')+'" onclick="EX.type=\''+e.id+'\';rEX()"><div class="ext-icon">'+e.icon+'</div><div class="ext-name">'+e.name+'</div><div class="ext-range">'+e.range+'</div></div>').join('')+'</div>'+planBdg(ext.planning)+'<div class="ib">'+ext.desc+' - '+ext.pdLimit+'</div></div>';
    b+='<div class="cd"><div class="ct">Project details</div><div class="g3"><div class="f"><label>Client</label><input value="'+EX.client+'" onchange="EX.client=this.value"/></div><div class="f"><label>Property</label><input value="'+EX.proj+'" onchange="EX.proj=this.value"/></div><div class="f"><label>Floor area (m2)</label><input type="number" value="'+EX.gia+'" step="1" onchange="EX.gia=+this.value;rEX()"/></div></div></div>'.replace(/m2/g,'m\u00b2');
    b+='<div class="cd"><div class="ct">Build rate band</div><div class="rate-bands-4">'+Object.entries(EXT_BANDS).map(([k,v])=>'<div class="rb'+(EX.band===k?' on':'')+'" onclick="EX.band=\''+k+'\';rEX()"><div class="rb-ft2">'+v.label+'</div><div class="rb-m2">L'+(k==='bespoke'?EX.customM2:v.m2)+'/m2</div><div class="rb-inc">'+v.desc+'</div></div>').join('')+'</div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2')+(EX.band==='bespoke'?'<div style="display:flex;align-items:center;gap:8px;background:rgba(184,150,78,.06);border:1px solid var(--bd);border-radius:6px;padding:.75rem;margin-bottom:.9rem"><span style="font-size:11px;color:var(--mu);flex:1">Enter your rate (L/m2):</span><input type="number" value="'+EX.customM2+'" step="50" style="width:90px;font-size:13px;padding:6px 9px;border:1px solid var(--bd);border-radius:4px;background:rgba(255,255,255,.08);color:var(--g);text-align:right;font-family:\'DM Sans\',sans-serif" oninput="EX.customM2=+this.value;rEX()"/><span style="font-size:11px;color:var(--mu)">/m2</span></div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2'):'');
    b+='<div class="tgl">Glazing & openings</div><div class="trow">'+[['none','None',0],['standard','Standard bifolds',120],['premium','Premium',280],['structural','Full structural glass',480]].map(([k,l,u])=>'<div class="tog'+(EX.spec.glazing===k?' on':'')+'" onclick="EX.spec.glazing=\''+k+'\';rEX()">'+l+(u?' <span style="font-size:9px">+L'+u+'/m2</span>':'')+'</div>').join('')+'</div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2');
    b+='<div class="tgl">Roof type</div><div class="trow">'+[['standard','Flat/standard',0],['pitched','Pitched',150],['vaulted','Vaulted/lantern',180],['lantern','Full lantern',220]].map(([k,l,u])=>'<div class="tog'+(EX.spec.roof===k?' on':'')+'" onclick="EX.spec.roof=\''+k+'\';rEX()">'+l+(u?' <span style="font-size:9px">+L'+u+'/m2</span>':'')+'</div>').join('')+'</div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2');
    b+='<div class="tgl">Internal finish</div><div class="trow">'+[['standard','Standard',0],['mid','Mid-range',150],['high','High spec',350],['luxury','Luxury',650]].map(([k,l,u])=>'<div class="tog'+(EX.spec.finish===k?' on':'')+'" onclick="EX.spec.finish=\''+k+'\';rEX()">'+l+(u?' <span style="font-size:9px">+L'+u+'/m2</span>':'')+'</div>').join('')+'</div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2');
    b+='<div class="tgl">Heating</div><div class="trow">'+[['none','Extend existing',0],['radiator','New radiators',80],['underfloor','Underfloor heating',180]].map(([k,l,u])=>'<div class="tog'+(EX.spec.heating===k?' on':'')+'" onclick="EX.spec.heating=\''+k+'\';rEX()">'+l+(u?' <span style="font-size:9px">+L'+u+'/m2</span>':'')+'</div>').join('')+'</div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2');
    b+=(up?'<div class="ib">Base rate L'+exBM2()+'/m2 + spec uplifts L'+up+'/m2 = <strong>L'+em+'/m2 effective</strong></div>':'<div class="ib">Base spec at <strong>L'+em+'/m2</strong> \u2014 no uplifts applied.</div>').replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2');
    b+='<div class="g2" style="margin-bottom:.75rem"><div class="f"><label>Prelims %</label><input type="number" value="'+EX.pre+'" step="1" onchange="EX.pre=+this.value;rEX()"/></div><div class="f"><label>Contingency %</label><input type="number" value="'+EX.con+'" step="1" onchange="EX.con=+this.value;rEX()"/></div></div>';
    b+='<div class="cd"><div class="ct">Cost summary</div><div class="fr"><span class="fl">Build cost ('+EX.gia+'m2 x L'+em+'/m2)</span><span class="fv">'+F(bc.base)+'</span></div><div class="fr"><span class="fl">Prelims ('+EX.pre+'%)</span><span class="fv">'+F(bc.pre)+'</span></div><div class="fr"><span class="fl">Contingency ('+EX.con+'%)</span><span class="fv">'+F(bc.con)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total (ex VAT)</span><span class="fv" style="color:var(--g);font-size:13px">'+F(bc.tot)+'</span></div><div class="fr"><span class="fl">VAT @ 20%</span><span class="fv">'+F(bc.tot*.2)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total inc VAT</span><span class="fv" style="color:var(--g);font-size:13px">'+F(bc.tot*1.2)+'</span></div></div><div class="ib red">Budget estimate only. Costs vary based on site conditions, structural requirements and contractor rates.</div>'.replace(/L/g,'\u00a3').replace(/m2/g,'m\u00b2');
  }
  if(exTab===1){
    const et=exET(),p=et*(EX.pre/100),c=(et+p)*(EX.con/100),gd=et+p+c;
    b+='<div class="ib blue">Elemental rates based on national averages for '+ext.name+' ('+EX.gia+'m\u00b2). Edit any rate or fixed cost to match your project.</div>';
    b+='<div class="cd" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:2fr 75px 75px 90px;padding:6px 9px;background:rgba(255,255,255,.05);font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em"><span>Element</span><span style="text-align:right">Rate/m2</span><span style="text-align:right">Fixed</span><span style="text-align:right">Total</span></div>'.replace(/m2/g,'m\u00b2');
    b+=EX.elems.map((e,i)=>'<div style="display:grid;grid-template-columns:2fr 75px 75px 90px;padding:6px 9px;border-top:1px solid rgba(184,150,78,.05);align-items:center"><span style="font-size:11px">'+e.n+'</span><div style="text-align:right"><input class="ni" type="number" value="'+e.m2r+'" onchange="EX.elems['+i+'].m2r=+this.value;rEX()" style="width:62px"/></div><div style="text-align:right"><input class="ni" type="number" value="'+e.fix+'" onchange="EX.elems['+i+'].fix=+this.value;rEX()" style="width:62px"/></div><span style="font-size:11px;text-align:right">'+F(e.m2r*EX.gia+e.fix)+'</span></div>').join('');
    b+='<div style="display:grid;grid-template-columns:2fr 75px 75px 90px;padding:8px 9px;background:rgba(184,150,78,.07);border-top:2px solid var(--bd)"><span style="font-size:12px;font-weight:600">Subtotal</span><span></span><span></span><span style="font-size:12px;font-weight:600;text-align:right">'+F(et)+'</span></div></div>';
    b+='<div class="cd"><div class="ct">Elemental cost summary</div><div class="fr"><span class="fl">Subtotal</span><span class="fv">'+F(et)+'</span></div><div class="fr"><span class="fl">Prelims</span><span class="fv">'+F(p)+'</span></div><div class="fr"><span class="fl">Contingency</span><span class="fv">'+F(c)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Grand total (ex VAT)</span><span class="fv" style="color:var(--g);font-size:13px">'+F(gd)+'</span></div><div class="fr"><span class="fl">VAT @ 20%</span><span class="fv">'+F(gd*.2)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Grand total inc VAT</span><span class="fv" style="color:var(--g);font-size:13px">'+F(gd*1.2)+'</span></div></div>';
  }
  if(exTab===2){
    const pi=[{l:'Householder Planning Application',c:258,n:'DLUHC fee (England 2025). If outside PD rights.'},{l:'Pre-application advice (LPA)',c:250,n:'Optional but recommended.'},{l:'Structural engineer',c:1500,n:'Foundation design, beam calculations, RSJ sizing.'},{l:'Building Regulations application',c:800,n:'Full plans application including all inspections.'},{l:'Party Wall surveyor (if applicable)',c:900,n:'If works within 3m of neighbour foundations.'},{l:'Topographical survey (if required)',c:650,n:'May be required by LPA or structural engineer.'}];
    const br=[{r:'Part A',t:'Structure',n:'Foundation & structural calculations required.'},{r:'Part B',t:'Fire safety',n:'Escape routes, fire doors, smoke detection.'},{r:'Part F',t:'Ventilation',n:'Adequate ventilation to new and affected rooms.'},{r:'Part L',t:'Energy',n:'U-values for walls, floors, roof and glazing must meet minimums.'},{r:'Part O',t:'Overheating',n:'Glazing-heavy extensions should be assessed.'},{r:'Part P',t:'Electrical',n:'Notifiable work must be done by registered electrician.'}];
    b+='<div class="cd"><div class="ct">Planning status \u2014 '+ext.name+'</div>'+planBdg(ext.planning)+'<div class="ib">'+ext.pdLimit+'</div></div>';
    b+='<div class="cd"><div class="ct">Professional fees allowance</div><table class="tbl"><thead><tr><th>Item</th><th style="text-align:right">Allowance</th><th>Notes</th></tr></thead><tbody>'+pi.map(p=>'<tr><td>'+p.l+'</td><td>'+F(p.c)+'</td><td style="font-size:10px;color:var(--mu)">'+p.n+'</td></tr>').join('')+'</tbody></table><div class="fr"><span class="fl">Indicative total</span><span class="fv go">'+F(pi.reduce((t,p)=>t+p.c,0))+'</span></div></div>';
    b+='<div class="cd"><div class="ct">Building Regulations \u2014 relevant parts</div><table class="tbl"><thead><tr><th>Part</th><th>Topic</th><th>Key requirement</th></tr></thead><tbody>'+br.map(x=>'<tr><td style="font-weight:500;color:var(--g)">'+x.r+'</td><td>'+x.t+'</td><td style="font-size:10px;color:var(--mu)">'+x.n+'</td></tr>').join('')+'</tbody></table></div>';
  }
  if(exTab===3){
    const bt=bc.tot;
    const vi=[{i:'Standard residential extension works',r:20,n:'Standard rate \u2014 applies to all works on an existing dwelling.'},{i:'Conversion from non-residential to residential',r:5,n:'5% reduced rate if converting from non-residential use.'},{i:'Listed building approved alterations',r:0,n:'Zero rated \u2014 HMRC certificate required.'},{i:'Qualifying disabled adaptations',r:0,n:'Zero rated \u2014 specific criteria, specialist advice needed.'},{i:'Professional fees',r:20,n:'Always standard rated regardless of works treatment.'},{i:'Planning application fee',r:'N/A',n:'Statutory fee \u2014 not subject to VAT.'}];
    b+='<div class="ib blue">VAT on extensions to existing dwellings is almost always 20% standard rated. The zero and reduced rate exceptions are narrow \u2014 take professional advice.</div>';
    b+='<div class="cd"><div class="ct">VAT rates for extension works</div><table class="tbl"><thead><tr><th>Item</th><th style="text-align:right">VAT</th><th>Notes</th></tr></thead><tbody>'+vi.map(v=>'<tr><td>'+v.i+'</td><td style="text-align:right">'+(typeof v.r==='number'?'<span class="'+(v.r===20?'vat-std':v.r===5?'vat-red':'vat-zero')+'">'+v.r+'%</span>':v.r)+'</td><td style="font-size:10px;color:var(--mu)">'+v.n+'</td></tr>').join('')+'</tbody></table></div>';
    b+='<div class="cd"><div class="ct">VAT summary for this project</div><div class="fr"><span class="fl">Build cost (ex VAT)</span><span class="fv">'+F(bt)+'</span></div><div class="fr"><span class="fl">VAT @ 20%</span><span class="fv" style="color:var(--rd)">'+F(bt*.2)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total inc VAT</span><span class="fv" style="color:var(--g);font-size:13px">'+F(bt*1.2)+'</span></div></div><div class="ib red">This summary is indicative only. Always take professional VAT advice for specific projects.</div>';
  }
  if(exTab===4){
    const bv=bc.tot,sel=SVCS_EX.filter(s=>s.sel),tp=sel.reduce((t,s)=>t+s.pct,0),tf=bv*(tp/100),vt=tf*.2;
    b+='<div class="cd"><div class="ct">Fee summary <span class="fpb">'+FP(tp)+' of build cost</span></div><div class="g3"><div class="mc"><div class="ml">Build cost</div><div class="mv">'+F(bv)+'</div></div><div class="mc"><div class="ml">Total fee %</div><div class="mv go">'+FP(tp)+'</div><div class="vb"><div class="vf" style="width:'+Math.min(100,(tp/8)*100)+'%"></div></div></div><div class="mc"><div class="ml">Fee (ex VAT)</div><div class="mv go">'+F(tf)+'</div></div></div></div>';
    b+='<div class="cd" style="padding:0;overflow:hidden"><div class="fee-row fhdr"><span>Service</span><span style="text-align:right">Rate %</span><span style="text-align:right">Fee ex VAT</span><span style="text-align:center">Tick</span></div>';
    ['Pre-Construction','Construction','Post-Construction'].forEach(cat=>{
      b+='<div style="display:grid;grid-template-columns:1fr 65px 85px 34px;padding:5px 9px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(184,150,78,.06)"><span style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--mu)">'+cat+'</span><span></span><span></span><span></span></div>';
      SVCS_EX.filter(s=>s.cat===cat).forEach(svc=>{const gi=SVCS_EX.indexOf(svc),fee=bv*(svc.pct/100);b+='<div class="fee-row'+(svc.sel?'':' inactive')+'"><div class="fee-nm">'+svc.name+'<div class="fee-d">'+svc.desc+'</div></div><div class="fee-pct">'+FP(svc.pct)+'</div><div class="fee-v">'+(svc.sel?F(fee):'\u2014')+'</div><div class="fee-ck"><input type="checkbox" '+(svc.sel?'checked':'')+' onchange="SVCS_EX['+gi+'].sel=this.checked;rEX()"/></div></div>';});
    });
    b+='<div class="fee-tot"><div style="font-size:12px;font-weight:600;color:var(--w)">Total selected</div><div class="fee-pct" style="color:var(--g);font-weight:600">'+FP(tp)+'</div><div class="fee-v" style="color:var(--g);font-weight:600">'+F(tf)+'</div><div></div></div></div>';
    b+='<div class="fee-sum"><div class="fee-sum-row"><span style="color:var(--mu)">Services selected</span><span>'+sel.length+' of '+SVCS_EX.length+'</span></div><div class="fee-sum-row"><span style="color:var(--mu)">Fee % of build cost</span><span style="color:var(--g);font-weight:600">'+FP(tp)+'</span></div><div class="fee-sum-row"><span style="color:var(--mu)">Fee (ex VAT)</span><span>'+F(tf)+'</span></div><div class="fee-sum-row"><span style="color:var(--mu)">VAT (20%)</span><span>'+F(vt)+'</span></div><div class="fee-sum-row"><span>Total payable (inc VAT)</span><span>'+F(tf+vt)+'</span></div></div>';
  }
  if(exTab===5){
    const mv=EX.move,bt=bc.tot*1.2,pf=4800,et=bt+pf;
    const sd=calcSDLT(mv.targetVal),ag=mv.houseVal*(mv.agentSale/100),tu=mv.targetVal-mv.houseVal,mct=sd+ag+mv.survey+mv.legal+mv.removal;
    const diff=mct-et,ew=diff>0,close=Math.abs(diff)<5000;
    b+='<div class="cd"><div class="ct">Extension costs</div><div class="fr"><span class="fl">Build cost (inc VAT)</span><span class="fv">'+F(bt)+'</span></div><div class="fr"><span class="fl">Planning, B-Regs, structural & professional</span><span class="fv">'+F(pf)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total cost to extend</span><span class="fv" style="color:var(--gn);font-size:13px">'+F(et)+'</span></div></div>';
    b+='<div class="cd"><div class="ct">Moving costs</div><div class="g3" style="margin-bottom:.75rem"><div class="f"><label>Current house value (L)</label><input type="number" value="'+mv.houseVal+'" step="5000" oninput="EX.move.houseVal=+this.value;rEX()" onchange="EX.move.houseVal=+this.value;rEX()"/></div><div class="f"><label>Target house value (L)</label><input type="number" value="'+mv.targetVal+'" step="5000" oninput="EX.move.targetVal=+this.value;rEX()" onchange="EX.move.targetVal=+this.value;rEX()"/></div><div class="f"><label>Agent fee (sale) %</label><input type="number" value="'+mv.agentSale+'" step=".1" oninput="EX.move.agentSale=+this.value;rEX()" onchange="EX.move.agentSale=+this.value;rEX()"/></div><div class="f"><label>Legal fees (L)</label><input type="number" value="'+mv.legal+'" step="100" oninput="EX.move.legal=+this.value;rEX()" onchange="EX.move.legal=+this.value;rEX()"/></div><div class="f"><label>Survey (L)</label><input type="number" value="'+mv.survey+'" step="50" oninput="EX.move.survey=+this.value;rEX()" onchange="EX.move.survey=+this.value;rEX()"/></div><div class="f"><label>Removals (L)</label><input type="number" value="'+mv.removal+'" step="100" oninput="EX.move.removal=+this.value;rEX()" onchange="EX.move.removal=+this.value;rEX()"/></div></div><div class="fr"><span class="fl">SDLT (auto-calculated)</span><span class="fv">'+F(sd)+'</span></div><div class="fr"><span class="fl">Agent fees + survey + legal + removals</span><span class="fv">'+F(ag+mv.survey+mv.legal+mv.removal)+'</span></div><div class="fr"><span class="fl">Equity / mortgage top-up needed</span><span class="fv" style="color:var(--pu)">'+F(tu)+'</span></div><div class="fr"><span class="fl" style="font-weight:500">Total transaction costs to move</span><span class="fv" style="color:var(--rd);font-size:13px">'+F(mct)+'</span></div></div>'.replace(/L/g,'\u00a3');
    b+=(close?'<div class="verdict close">The costs are very close \u2014 difference of just '+F(Math.abs(diff))+'. Decision comes down to lifestyle and location preference.</div>':ew?'<div class="verdict ext-win">Extending is <strong>'+F(diff)+'</strong> cheaper than moving. You keep your neighbourhood and avoid the disruption of a sale.</div>':'<div class="verdict mov-win">Moving costs are only '+F(Math.abs(diff))+' more than extending \u2014 may be worth considering a larger overall property.</div>');
    b+='<div class="cmp-grid"><div class="cmp-col ec"><div class="cmp-title">Extend</div><div class="fr"><span class="fl">Build + VAT</span><span class="fv">'+F(bt)+'</span></div><div class="fr"><span class="fl">Professional fees</span><span class="fv">'+F(pf)+'</span></div><div class="cmp-total" style="color:var(--gn)">'+F(et)+'</div><div style="font-size:10px;color:var(--mu);margin-top:4px">Stay put \u2014 gain '+EX.gia+'m2</div></div><div style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--mu)">vs</div><div class="cmp-col mc"><div class="cmp-title">Move</div><div class="fr"><span class="fl">SDLT</span><span class="fv">'+F(sd)+'</span></div><div class="fr"><span class="fl">All other moving costs</span><span class="fv">'+F(ag+mv.survey+mv.legal+mv.removal)+'</span></div><div class="cmp-total" style="color:var(--rd)">'+F(mct)+'</div><div style="font-size:10px;color:var(--mu);margin-top:4px">Transaction costs only (not mortgage top-up)</div></div></div><div class="ib">SDLT calculated at 2025/26 England standard residential rates. First-time buyer relief and additional dwelling surcharge not included.</div>'.replace(/m2/g,'m\u00b2');
  }
  if(exTab===6){
    let tB=0,tA=0;
    b+='<div class="cd" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;padding:6px 9px;background:rgba(255,255,255,.05);font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em"><span>Element</span><span style="text-align:right">Budget</span><span style="text-align:right">Actual</span><span style="text-align:right">Remaining</span><span style="text-align:right">Variance</span></div>';
    EX.elems.forEach((e,i)=>{const bud=Math.round(e.m2r*EX.gia+e.fix),act=EX.actuals[i]||0,rem=bud-act,vari=act-bud;tB+=bud;tA+=act;b+='<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;padding:6px 9px;border-top:1px solid rgba(184,150,78,.05);align-items:center"><span style="font-size:11px">'+e.n+'</span><span style="font-size:11px;text-align:right;color:var(--mu)">'+F(bud)+'</span><input class="ni w" type="number" value="'+(act||'')+'" placeholder="0" onchange="EX.actuals['+i+']=+this.value;rEX()" style="margin-left:auto"/><span style="font-size:11px;text-align:right">'+F(rem)+'</span><span style="font-size:11px;font-weight:500;text-align:right;color:'+(vari>0?'var(--rd)':vari<0?'var(--gn)':'var(--mu)')+'">'+( vari>0?'+':'')+F(vari)+'</span></div>';});
    const tv=tA-tB;b+='<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;padding:8px 9px;background:rgba(184,150,78,.07);border-top:2px solid var(--bd)"><span style="font-size:12px;font-weight:600">Total</span><span style="font-size:12px;font-weight:600;text-align:right">'+F(tB)+'</span><span style="font-size:12px;font-weight:600;text-align:right">'+F(tA)+'</span><span style="font-size:12px;font-weight:600;text-align:right">'+F(tB-tA)+'</span><span style="font-size:12px;font-weight:600;text-align:right;color:'+(tv>0?'var(--rd)':'var(--gn)')+'">'+( tv>0?'+':'')+F(tv)+'</span></div></div>';
  }
  if(exTab===7){b+=renderMXInline('ex');}
  document.getElementById('v4').innerHTML=wrap('House Extension & Small Works Calculator','7 extension types \u00b7 Rate bands + elemental \u00b7 Planning & Regs \u00b7 VAT \u00b7 Extend vs move',met+stabs+b,4,'<button class="bg" onclick="exEstPDF()">Cost Estimate PDF</button><button class="bg" onclick="exFeePDF()">Fee PDF</button>');
}
function exEstPDF(){const ext=exType(),bc=exBC(),em=exEffM2(),up=exUp();let er=EX.elems.map(e=>'<tr><td>'+e.n+'</td><td>'+(e.m2r?'\u00a3'+e.m2r+'/m\u00b2':'Fixed')+'</td><td>'+F(e.m2r*EX.gia+e.fix)+'</td></tr>').join('');opdf('<h1>Extension Cost Estimate</h1><h2>'+EX.client+' \u00b7 '+EX.proj+' \u00b7 '+TD()+'</h2><table><thead><tr><th>Item</th><th>Detail</th></tr></thead><tbody><tr><td>Extension type</td><td>'+ext.name+'</td></tr><tr><td>Floor area</td><td>'+EX.gia+'m\u00b2</td></tr><tr><td>Effective rate</td><td>\u00a3'+em+'/m\u00b2</td></tr></tbody></table><h3>Cost breakdown</h3><table><thead><tr><th>Element</th><th>Basis</th><th style="text-align:right">Cost</th></tr></thead><tbody>'+er+'<tr class="tr"><td colspan="2">Base build cost</td><td>'+F(bc.base)+'</td></tr><tr class="tr"><td colspan="2">Prelims & contingency</td><td>'+F(bc.pre+bc.con)+'</td></tr><tr class="tr"><td colspan="2" style="font-size:14px">Total (ex VAT)</td><td style="font-size:14px;color:#B8964E">'+F(bc.tot)+'</td></tr><tr class="tr"><td colspan="2">VAT @ 20%</td><td>'+F(bc.tot*.2)+'</td></tr><tr class="tr"><td colspan="2" style="font-size:14px">Total (inc VAT)</td><td style="font-size:14px;color:#B8964E">'+F(bc.tot*1.2)+'</td></tr></tbody></table><p class="note">Budget estimate only. Costs vary based on site conditions and contractor pricing. Prepared by Signature Construction Projects Ltd.</p>','Cost Estimate');}
function exFeePDF(){const bv=exBC().tot,sel=SVCS_EX.filter(s=>s.sel),tp=sel.reduce((t,s)=>t+s.pct,0),tf=bv*(tp/100);let r=sel.map(s=>'<tr><td>'+s.name+'</td><td>'+s.cat+'</td><td>'+FP(s.pct)+'</td><td>'+F(bv*(s.pct/100))+'</td></tr>').join('');opdf('<h1>Fee Proposal</h1><h2>'+EX.client+' \u00b7 '+EX.proj+' \u00b7 '+TD()+'</h2><table><thead><tr><th>Service</th><th>Phase</th><th>Rate %</th><th>Fee (ex VAT)</th></tr></thead><tbody>'+r+'<tr class="tr"><td colspan="2">Total fee %</td><td>'+FP(tp)+'</td><td>'+F(tf)+'</td></tr><tr class="tr"><td colspan="3">VAT (20%)</td><td>'+F(tf*.2)+'</td></tr><tr class="tr"><td colspan="3">Total (inc VAT)</td><td>'+F(tf*1.2)+'</td></tr></tbody></table><p class="note">Valid 30 days \u00b7 14-day payment terms \u00b7 Prepared by Signature Construction Projects Ltd</p>','Extensions Fee Proposal');}


/* \u2500\u2500 MATERIALS CALCULATOR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
const MX={proj:'',client:'',wallType:'cavity',roofType:'flat',floorType:'concrete',ceilingH:2.4,studSpacing:400,joistSpacing:400,rafterSpacing:400,plaster:true,walls:[],openings:[],roof:{span:4.0,length:4.0,pitch:15,overhang:.45},floor:{L:4.0,W:4.0},uploadedFiles:[],drawingImages:[],aiState:'idle',aiLog:[],extracted:{},confidence:{}};
const MXW=1.10;
const MX_PROXY_URL='https://signature-qs-proxy.onrender.com';
const mxFN=n=>parseFloat(n)||0;
const mxF2=n=>Math.round(n*100)/100;
function mxFA(){return mxFN(MX.floor.L)*mxFN(MX.floor.W);}
function mxEWG(){return MX.walls.filter(w=>w.ext).reduce((t,w)=>t+mxFN(w.L)*mxFN(w.H),0);}
function mxOA(){return MX.openings.reduce((t,o)=>t+mxFN(o.W)*mxFN(o.H)*mxFN(o.qty),0);}
function mxEWN(){return Math.max(0,mxEWG()-mxOA());}
function mxIWA(){return MX.walls.filter(w=>!w.ext).reduce((t,w)=>t+mxFN(w.L)*mxFN(w.H),0);}
function mxAWA(){return mxEWN()+mxIWA();}
function mxPerim(){return MX.walls.reduce((t,w)=>t+mxFN(w.L),0);}
function mxRA(){const sp=mxFN(MX.roof.span),ln=mxFN(MX.roof.length),pt=mxFN(MX.roof.pitch),ov=mxFN(MX.roof.overhang);if(MX.roofType==='flat')return(sp+ov*2)*(ln+ov*2);const pr=pt*(Math.PI/180);return((sp/2)/Math.cos(pr))*2*(ln+ov*2);}
function mxRL(){const sp=mxFN(MX.roof.span),pt=mxFN(MX.roof.pitch),ov=mxFN(MX.roof.overhang);return(sp/2)/Math.cos(pt*(Math.PI/180))+ov;}

function mxCalc(){
  const fa=mxFA(),ewn=mxEWN(),iwn=mxIWA(),awa=mxAWA(),perim=mxPerim(),ra=mxRA(),cH=mxFN(MX.ceilingH);
  const ss=mxFN(MX.studSpacing)/1000,js=mxFN(MX.joistSpacing)/1000,rs=mxFN(MX.rafterSpacing)/1000;
  const sp=mxFN(MX.roof.span),rln=mxFN(MX.roof.length),ov=mxFN(MX.roof.overhang);
  const mats=[];
  if(MX.wallType==='cavity'){
    mats.push({cat:'Masonry',item:'Engineering bricks (outer leaf)',qty:Math.ceil(ewn*59*MXW),unit:'nr',note:'59/m2 stretcher bond',basis:ewn.toFixed(1)+'m2 net'});
    mats.push({cat:'Masonry',item:'Mortar - brickwork (25kg bags)',qty:Math.ceil(ewn*0.5*MXW),unit:'bags',note:'0.5 bags/m2',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Concrete blocks 100mm dense (inner leaf)',qty:Math.ceil(awa*7.26*MXW),unit:'nr',note:'7.26 blocks/m2 (440x215mm)',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Mortar - blockwork (25kg bags)',qty:Math.ceil(awa*0.35*MXW),unit:'bags',note:'0.35 bags/m2',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Stainless steel wall ties',qty:Math.ceil(ewn*2.5*MXW),unit:'nr',note:'2.5 ties/m2 cavity',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Cavity wall insulation batts (full-fill)',qty:mxF2(ewn*MXW),unit:'m2',note:'100mm PIR or mineral wool',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'DPC 150mm',qty:mxF2(perim*MXW),unit:'m',note:'Base of all ext walls',basis:perim.toFixed(1)+'m perimeter'});
  }else if(MX.wallType==='solid'){
    mats.push({cat:'Masonry',item:'Concrete blocks 100mm dense',qty:Math.ceil(awa*7.26*2*MXW),unit:'nr',note:'Two leaves',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Mortar (25kg bags)',qty:Math.ceil(awa*0.7*MXW),unit:'bags',note:'Both leaves combined',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'DPC 150mm',qty:mxF2(perim*MXW),unit:'m',note:'Base of all ext walls',basis:perim.toFixed(1)+'m'});
    mats.push({cat:'Masonry',item:'Wall insulation 100mm PIR (internal face)',qty:mxF2(ewn*MXW),unit:'m2',note:'Fixed to inner face',basis:ewn.toFixed(1)+'m2'});
  }else{
    const sLin=awa*((1/ss)*cH+2+(1/0.6));
    mats.push({cat:'Timber Frame',item:'CLS timber 38x89mm (studs/plates/noggings)',qty:Math.ceil(sLin*MXW),unit:'lin m',note:'At '+MX.studSpacing+'mm c/c',basis:awa.toFixed(1)+'m2 wall'});
    mats.push({cat:'Timber Frame',item:'OSB3 11mm sheathing (ext face)',qty:mxF2(ewn*MXW),unit:'m2',note:'External sheathing',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Timber Frame',item:'Breather membrane',qty:mxF2(ewn*MXW),unit:'m2',note:'Over sheathing',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Timber Frame',item:'Vapour control layer (VCL)',qty:mxF2(awa*MXW),unit:'m2',note:'Internal face of insulated walls',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Timber Frame',item:'Wall insulation 100mm PIR between studs',qty:mxF2(ewn*MXW),unit:'m2',note:'Cut between studs',basis:ewn.toFixed(1)+'m2'});
  }
  if(MX.floorType==='concrete'){
    mats.push({cat:'Floor (Concrete)',item:'Sharp sand blinding 50mm',qty:mxF2(fa*0.05*MXW),unit:'m3',note:'Below DPM',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'DPM 300mu polythene',qty:mxF2(fa*MXW),unit:'m2',note:'Below insulation',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'Floor insulation 100mm PIR',qty:mxF2(fa*MXW),unit:'m2',note:'Meets Part L',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'Ready-mix concrete C25 (100mm slab)',qty:mxF2(fa*0.1*MXW),unit:'m3',note:'100mm ground bearing slab',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'A142 steel reinforcement mesh',qty:mxF2(fa*MXW),unit:'m2',note:'200x200mm, 3.55kg/m2',basis:fa.toFixed(1)+'m2'});
  }else{
    const nJ=Math.ceil(mxFN(MX.floor.W)/js)+1;
    mats.push({cat:'Floor (Timber)',item:'Timber joists 47x195mm C24',qty:Math.ceil(nJ*mxFN(MX.floor.L)*MXW),unit:'lin m',note:'At '+MX.joistSpacing+'mm c/c',basis:nJ+' joists'});
    mats.push({cat:'Floor (Timber)',item:'Joist hangers (galv steel)',qty:Math.ceil(nJ*2*MXW),unit:'nr',note:'Both ends each joist',basis:nJ+' joists'});
    mats.push({cat:'Floor (Timber)',item:'Floor insulation 100mm (between joists)',qty:mxF2(fa*MXW),unit:'m2',note:'Friction-fit mineral wool',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Timber)',item:'DPM 300mu polythene',qty:mxF2(fa*MXW),unit:'m2',note:'Below insulation',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Timber)',item:'T&G chipboard decking 22mm',qty:mxF2(fa*MXW),unit:'m2',note:'2400x600mm glued and screwed',basis:fa.toFixed(1)+'m2'});
  }
  if(MX.roofType==='flat'){
    const nRJ=Math.ceil(rln/js)+1;
    mats.push({cat:'Roof (Flat)',item:'Flat roof joists 47x175mm C24',qty:Math.ceil(nRJ*(sp+ov*2)*MXW),unit:'lin m',note:'At '+MX.rafterSpacing+'mm c/c',basis:rln.toFixed(1)+'m run'});
    mats.push({cat:'Roof (Flat)',item:'Firring pieces tapered (1:60 fall)',qty:Math.ceil(nRJ*(sp+ov*2)*MXW),unit:'lin m',note:'Drainage fall',basis:rln.toFixed(1)+'m run'});
    mats.push({cat:'Roof (Flat)',item:'OSB3 18mm roof deck',qty:mxF2(ra*MXW),unit:'m2',note:'Structural deck',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'Vapour control layer (VCL)',qty:mxF2(ra*MXW),unit:'m2',note:'Below insulation warm roof',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'PIR insulation 150mm (warm roof)',qty:mxF2(ra*MXW),unit:'m2',note:'Two layers 100+50mm staggered',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'EPDM single-ply membrane 1.2mm',qty:mxF2(ra*MXW),unit:'m2',note:'Fully bonded',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'Aluminium drip edge trim',qty:mxF2((2*(sp+ov*2)+2*(rln+ov*2))*MXW),unit:'lin m',note:'Full roof perimeter',basis:'Perimeter'});
  }else{
    const rl=mxRL(),nR=Math.ceil((rln+ov*2)/rs)*2+2;
    mats.push({cat:'Roof (Pitched)',item:'Rafters 47x150mm C24',qty:Math.ceil(nR*rl*MXW),unit:'lin m',note:'At '+MX.rafterSpacing+'mm c/c both pitches',basis:nR+' rafters'});
    mats.push({cat:'Roof (Pitched)',item:'Ridge board 47x225mm',qty:Math.ceil((rln+ov*2)*MXW),unit:'lin m',note:'Full ridge',basis:(rln+ov*2).toFixed(1)+'m'});
    const nC=Math.ceil(rln/0.6);
    mats.push({cat:'Roof (Pitched)',item:'Collar ties 47x120mm',qty:Math.ceil(nC*sp*MXW),unit:'lin m',note:'At 600mm c/c',basis:nC+' x '+sp.toFixed(1)+'m'});
    mats.push({cat:'Roof (Pitched)',item:'Roofing underlay (breather membrane)',qty:mxF2(ra*MXW),unit:'m2',note:'Over rafters before battening',basis:ra.toFixed(1)+'m2'});
    const bL=Math.ceil(rl/0.345)*(rln+ov*2)*2;
    mats.push({cat:'Roof (Pitched)',item:'Tiling battens 25x50mm sw',qty:Math.ceil(bL*MXW),unit:'lin m',note:'345mm gauge standard tile',basis:ra.toFixed(1)+'m2 slope'});
    mats.push({cat:'Roof (Pitched)',item:'Roof tiles (concrete interlocking)',qty:Math.ceil(ra*10*MXW),unit:'nr',note:'~10 tiles/m2 at 345mm gauge',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Pitched)',item:'Ridge tiles (half-round)',qty:Math.ceil((rln+ov*2)/0.3*MXW),unit:'nr',note:'~3.3/lin m',basis:(rln+ov*2).toFixed(1)+'m ridge'});
    mats.push({cat:'Roof (Pitched)',item:'PIR insulation 150mm between/over rafters',qty:mxF2(ra*MXW),unit:'m2',note:'Cut between + 50mm continuous over',basis:ra.toFixed(1)+'m2'});
  }
  if(MX.plaster){
    const pbW=MX.wallType==='timber'?awa*2:awa;
    mats.push({cat:'Boards & Linings',item:'Plasterboard 12.5mm TE 1200x2400 - walls',qty:Math.ceil(pbW*MXW/2.88),unit:'nr',note:'2.88m2 per board',basis:pbW.toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:'Plasterboard 12.5mm TE - ceiling',qty:Math.ceil(fa*MXW/2.88),unit:'nr',note:'2.88m2 per board',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:'Plasterboard bonding / dab adhesive (25kg)',qty:Math.ceil(awa/2*MXW),unit:'bags',note:'1 bag per 2m2',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:'Jointing tape & joint filler',qty:Math.ceil((pbW+fa)*MXW/20),unit:'rolls/bags',note:'1 per 20m2',basis:(pbW+fa).toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:'Finishing plaster skim (25kg bags)',qty:Math.ceil((awa+fa)*1.5/25*MXW),unit:'bags',note:'1.5kg/m2',basis:(awa+fa).toFixed(1)+'m2'});
  }
  if(MX.openings.length>0)mats.push({cat:'Structural',item:'Steel lintels (over openings)',qty:Math.ceil(MX.openings.length*MXW),unit:'nr',note:'1 per opening - size to engineer spec',basis:MX.openings.length+' openings'});
  if(MX.wallType!=='timber'){
    mats.push({cat:'Structural',item:'Wall plate 75x100mm sw (wall heads)',qty:Math.ceil(perim*MXW),unit:'lin m',note:'Bedded in mortar on masonry',basis:perim.toFixed(1)+'m'});
    mats.push({cat:'Structural',item:'Galvanised restraint straps 30x5mm',qty:Math.ceil(perim/1.2*MXW),unit:'nr',note:'1 per 1.2m wall plate',basis:perim.toFixed(1)+'m'});
  }
  mats.push({cat:'Fixings & Sundries',item:'Structural screws 5x100mm (200 box)',qty:Math.ceil((fa+awa)/10*MXW),unit:'boxes',note:'All structural timber',basis:'By area'});
  mats.push({cat:'Fixings & Sundries',item:'Round wire nails 3.1x90mm (2.5kg box)',qty:Math.ceil((fa+awa)/20*MXW),unit:'boxes',note:'General framing',basis:'By area'});
  mats.push({cat:'Fixings & Sundries',item:'Expanding foam sealant 750ml',qty:Math.ceil((MX.openings.length*2+perim/5)*MXW),unit:'cans',note:'Around frames & penetrations',basis:'Openings + perimeter'});
  mats.push({cat:'Fixings & Sundries',item:'Silicone sealant 310ml cartridges',qty:Math.ceil((MX.openings.length*2+perim/8)*MXW),unit:'nr',note:'Around all frames',basis:'Openings + perimeter'});
  return mats;
}

async function mxAnalyse(){
  if(MX.uploadedFiles.length===0)return;
  MX.aiState='processing';MX.aiLog=[];MX.extracted={};rMX();

  function mxLog(msg,type='active'){
    MX.aiLog=MX.aiLog.map(l=>l.type==='active'?{...l,type:'done'}:l);
    MX.aiLog.push({msg,type});
    rMX();
  }

  try{
    mxLog('Uploading drawings \u2014 extracting schedules, floor areas, spec...');

    // Build FormData with all uploaded files
    const formData=new FormData();
    for(const file of MX.rawFiles){
      formData.append('drawings', file, file.name);
    }

    mxLog('Sending to AI for analysis...');

    // First check the proxy is awake
    let proxyUrl=MX_PROXY_URL;
    if(!proxyUrl||proxyUrl.includes('YOUR-PROXY-URL')){
      throw new Error('Proxy URL not configured \u2014 see README for setup instructions');
    }

    const resp=await fetch(proxyUrl+'/analyse-drawing',{
      method:'POST',
      body:formData,
    });

    mxLog('Processing AI response...');

    if(!resp.ok){
      const errText=await resp.text();
      throw new Error('Server error '+resp.status+': '+errText.substring(0,150));
    }

    const result=await resp.json();
    if(!result.success||!result.data){
      throw new Error(result.error||'Unexpected response from server');
    }

    const parsed=result.data;
    MX.extracted=parsed;
    mxLog('Applying extracted dimensions to calculator...');

    if(parsed.project_name)MX.proj=parsed.project_name;
    if(parsed.floor){
      if(parsed.floor.length_m)MX.floor.L=parsed.floor.length_m;
      if(parsed.floor.width_m)MX.floor.W=parsed.floor.width_m;
      if(parsed.floor.ceiling_height_m)MX.ceilingH=parsed.floor.ceiling_height_m;
    }
    if(parsed.walls&&parsed.walls.length>0){
      MX.walls=parsed.walls.map(w=>({
        label:w.label||'Wall',
        L:w.length_m||3,
        H:w.height_m||MX.ceilingH||2.4,
        ext:w.is_external!==false
      }));
    } else if(parsed.floor&&parsed.floor.length_m&&parsed.floor.width_m){
      const L=parsed.floor.length_m,Wd=parsed.floor.width_m,Ht=MX.ceilingH||2.4;
      MX.walls=[
        {label:'Front wall',L,H:Ht,ext:true},
        {label:'Rear wall',L,H:Ht,ext:true},
        {label:'Left wall',L:Wd,H:Ht,ext:true},
        {label:'Right wall',L:Wd,H:Ht,ext:true},
      ];
      mxLog('Individual walls not found - generated from floor area','warn');
    }
    if(parsed.openings&&parsed.openings.length>0){
      MX.openings=parsed.openings.map(o=>({
        label:o.label||o.type||'Opening',
        W:o.width_m||1,
        H:o.height_m||2.1,
        qty:o.qty||1
      }));
    }
    if(parsed.roof){
      if(parsed.roof.type&&parsed.roof.type!=='unknown')
        MX.roofType=parsed.roof.type==='pitched'?'pitched':'flat';
      if(parsed.roof.span_m)MX.roof.span=parsed.roof.span_m;
      if(parsed.roof.length_m)MX.roof.length=parsed.roof.length_m;
      if(parsed.roof.pitch_degrees)MX.roof.pitch=parsed.roof.pitch_degrees;
      if(parsed.roof.overhang_m)MX.roof.overhang=parsed.roof.overhang_m;
    }
    if(parsed.wall_construction&&parsed.wall_construction!=='unknown')
      MX.wallType=parsed.wall_construction;
    if(parsed.floor_construction&&parsed.floor_construction!=='unknown')
      MX.floorType=parsed.floor_construction;
    MX.confidence=parsed.confidence||{};
    (parsed.missing||[]).forEach(m=>mxLog('Could not find: '+m,'warn'));
    mxLog('Done - review dimensions in the Dimensions tab','done');
    MX.aiState='done';

  }catch(err){
    console.error('mxAnalyse error:',err);
    const msg=err.message||'Unknown error';
    if(msg.includes('Failed to fetch')||msg.includes('NetworkError')){
      MX.aiLog.push({msg:'Could not reach the analysis server. Check your internet connection, or the proxy may be waking up (wait 30s and try again).',type:'warn'});
    } else {
      MX.aiLog.push({msg:'Error: '+msg,type:'warn'});
    }
    MX.aiState='error';
  }
  rMX();
}

function mxHandleFiles(files){
  MX.uploadedFiles=[];
  MX.drawingImages=[];
  MX.rawFiles=[]; // store actual File objects for FormData
  MX.aiState='idle';

  const readers=[...files].map(file=>new Promise(res=>{
    MX.rawFiles.push(file); // keep the File object
    MX.uploadedFiles.push({name:file.name,type:file.type,size:file.size});
    // Also read as base64 for preview (optional)
    const rd=new FileReader();
    rd.onload=e=>{
      MX.drawingImages.push({data:e.target.result.split(',')[1],type:file.type,name:file.name});
      res();
    };
    rd.readAsDataURL(file);
  }));
  Promise.all(readers).then(()=>rMX());
}

function mxAddOpening(){
  const lbl=document.getElementById('mxOL')?.value||'Opening',W2=parseFloat(document.getElementById('mxOW')?.value)||1,H2=parseFloat(document.getElementById('mxOH')?.value)||2.1,qty=parseInt(document.getElementById('mxOQ')?.value)||1;
  MX.openings.push({label:lbl,W:W2,H:H2,qty});rMX();
}

function setMXTab(i){mxTab=i;rMX();}

function rMX(){
  const fa=mxFA(),ewn=mxEWN(),ra=mxRA(),perim=mxPerim();
  const confBdg=c=>'<span class="conf2 '+(c==='high'?'high':c==='medium'?'med':'low')+'">'+(c||'?')+'</span>';
  const met='<div class="ms"><div class="mc"><div class="ml">Floor area</div><div class="mv go">'+fa.toFixed(1)+'m2</div></div><div class="mc"><div class="ml">Ext wall (net)</div><div class="mv">'+ewn.toFixed(1)+'m2</div></div><div class="mc"><div class="ml">All wall area</div><div class="mv">'+mxAWA().toFixed(1)+'m2</div></div><div class="mc"><div class="ml">Perimeter</div><div class="mv">'+perim.toFixed(1)+'m</div></div><div class="mc"><div class="ml">Roof area</div><div class="mv">'+ra.toFixed(1)+'m2</div></div><div class="mc"><div class="ml">Openings</div><div class="mv">'+MX.openings.length+' nr</div></div></div>';
  const stabs='<div class="subtabs">'+['Upload Drawings','Dimensions','Spec & Roof','Openings','Schedule'].map((l,i)=>'<button class="stab'+(mxTab===i?' active':'')+'" onclick="setMXTab('+i+')">'+l+'</button>').join('')+'</div>';
  let body='';

  if(mxTab===0){
    body+='<div class="cd"><div class="ct">Upload architect\'s drawings</div>';
    body+='<div class="upload-zone" id="mxDrop" ondragover="event.preventDefault();this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="event.preventDefault();mxHandleFiles(event.dataTransfer.files)"><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple onchange="mxHandleFiles(this.files)"/><div style="font-size:2.2rem;margin-bottom:.65rem">&#128208;</div><div style="font-family:\'Cormorant Garamond\',serif;font-size:1.1rem;font-weight:600;margin-bottom:.35rem">Drop drawings here or click to browse</div><div style="font-size:.78rem;color:var(--mu);line-height:1.6">Supports PDF, JPG, PNG - Floor plans, elevations, sections, schedules<br>Annotated dimensions are read directly - never estimated from scale</div></div>';
    if(MX.uploadedFiles.length>0){
      body+='<div style="margin-top:.85rem"><div style="font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">'+MX.uploadedFiles.length+' file'+(MX.uploadedFiles.length>1?'s':'')+' ready</div>'+MX.uploadedFiles.map(f=>'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(184,150,78,.06);font-size:11px"><span>&#128196;</span><span style="flex:1;color:#ccc">'+f.name+'</span><span style="color:var(--mu)">'+(f.size/1024).toFixed(0)+'KB</span></div>').join('')+'</div>';
      if(MX.aiState==='idle'||MX.aiState==='error')body+='<button class="bg" style="background:var(--bl);color:#fff;margin-top:1rem;width:100%;padding:.85rem" onclick="mxAnalyse()">Analyse drawings with AI - extract all dimensions automatically</button>';
      body+='<div class="ib blue" style="margin-top:.75rem">Claude reads every annotated dimension, room label, window/door schedule and construction note. It only uses text annotations - never guesses from scale. Missing values are flagged for manual entry.</div>';
    }
    body+='</div>';
    if(MX.aiState==='processing'||MX.aiState==='done'||MX.aiState==='error'){
      const isPrc=MX.aiState==='processing';
      body+='<div class="ai-panel"><div class="ai-title">'+(isPrc?'<div class="ai-spinner"></div>':'AI')+' '+(isPrc?'AI is reading your drawings...':'AI extraction complete')+'</div><div class="ai-log">'+MX.aiLog.map(l=>'<div class="astep '+l.type+'">'+(l.type==='done'?'done':l.type==='warn'?'warn':'-')+' '+l.msg+'</div>').join('')+'</div>';
      if(MX.aiState==='done'&&MX.extracted&&Object.keys(MX.extracted).length>0){
        const ex=MX.extracted,conf=MX.confidence||{};
        body+='<div class="ex-grid"><div class="ex-box"><div class="ex-lbl">Floor dimensions '+confBdg(conf.floor_dims)+'</div><div class="ex-it"><span>Length</span><span class="ex-v '+(ex.floor?.length_m?'found':'missing')+'">'+(ex.floor?.length_m?ex.floor.length_m+'m':'Not found')+'</span></div><div class="ex-it"><span>Width</span><span class="ex-v '+(ex.floor?.width_m?'found':'missing')+'">'+(ex.floor?.width_m?ex.floor.width_m+'m':'Not found')+'</span></div><div class="ex-it"><span>Ceiling height</span><span class="ex-v '+(ex.floor?.ceiling_height_m?'found':'assumed')+'">'+(ex.floor?.ceiling_height_m?ex.floor.ceiling_height_m+'m':'2.4m assumed')+'</span></div></div><div class="ex-box"><div class="ex-lbl">Walls & openings '+confBdg(conf.wall_dims)+'</div><div class="ex-it"><span>Walls extracted</span><span class="ex-v '+(MX.walls.length?'found':'missing')+'">'+(MX.walls.length?MX.walls.length+' walls':'None found')+'</span></div><div class="ex-it"><span>Openings</span><span class="ex-v '+(MX.openings.length?'found':'assumed')+'">'+(MX.openings.length?MX.openings.length+' openings':'None found')+'</span></div></div><div class="ex-box"><div class="ex-lbl">Roof '+confBdg(conf.roof)+'</div><div class="ex-it"><span>Type</span><span class="ex-v '+(ex.roof?.type&&ex.roof.type!=='unknown'?'found':'assumed')+'">'+(ex.roof?.type&&ex.roof.type!=='unknown'?ex.roof.type:'Unknown')+'</span></div><div class="ex-it"><span>Span</span><span class="ex-v '+(ex.roof?.span_m?'found':'missing')+'">'+(ex.roof?.span_m?ex.roof.span_m+'m':'Not found')+'</span></div></div><div class="ex-box"><div class="ex-lbl">Drawing types</div>'+(ex.drawing_type||[]).map(d=>'<div class="ex-it"><span>'+d+'</span><span class="ex-v found">found</span></div>').join('')+'</div></div>';
        if(ex.notes&&ex.notes.length)body+='<div class="ib" style="margin-top:.75rem"><strong>AI notes:</strong> '+ex.notes.join(' - ')+'</div>';
        if(ex.missing&&ex.missing.length)body+='<div class="ib red" style="margin-top:.5rem"><strong>Not found - enter manually:</strong> '+ex.missing.join(' - ')+'</div>';
        body+='<button class="bg" style="margin-top:.85rem" onclick="setMXTab(1)">Review and edit dimensions</button>';
      }
      body+='</div>';
    }
    if(MX.aiState==='idle')body+='<div class="cd" style="margin-top:.9rem"><div class="ct">For best results</div><div class="g2">'+[['OK','Dimensioned floor plans','All wall lengths annotated in mm or m'],['OK','Elevations with heights','Window/door head and cill heights shown'],['OK','Window and door schedules','Table of types, sizes and quantities'],['OK','Section drawings','Ceiling heights, floor and roof build-up'],['WARN','Sketch drawings','Must still have text dimensions annotated'],['NO','Scale-bar only drawings','Cannot measure from scale - needs text dimensions']].map(([ic,t,s])=>'<div style="display:flex;gap:8px;font-size:11px;padding:.5rem;background:rgba(255,255,255,.02);border-radius:5px;border:1px solid var(--bd)"><span style="font-size:1rem;flex-shrink:0">'+ic+'</span><div><div style="color:#ccc;font-weight:500;margin-bottom:2px">'+t+'</div><div style="color:var(--mu)">'+s+'</div></div></div>').join('')+'</div></div>';
  }

  if(mxTab===1){
    if(MX.aiState==='done')body+='<div class="ib green">Dimensions pre-filled from AI drawing analysis. Check each value and correct anything the AI could not read.</div>';
    body+='<div class="cd"><div class="ct">Project</div><div class="g2"><div class="f"><label>Client</label><input value="'+MX.client+'" onchange="MX.client=this.value"/></div><div class="f"><label>Property</label><input value="'+MX.proj+'" onchange="MX.proj=this.value"/></div></div></div>';
    body+='<div class="cd"><div class="ct">Floor plan dimensions</div><div class="g3"><div class="f"><label>Floor length (m)</label><input type="number" value="'+MX.floor.L+'" step=".1" min=".5" onchange="MX.floor.L=+this.value;rMX()"/></div><div class="f"><label>Floor width (m)</label><input type="number" value="'+MX.floor.W+'" step=".1" min=".5" onchange="MX.floor.W=+this.value;rMX()"/></div><div class="f"><label>Ceiling height (m)</label><input type="number" value="'+MX.ceilingH+'" step=".05" min="2.1" max="4" onchange="MX.ceilingH=+this.value;rMX()"/></div></div>';
    const pL=mxFN(MX.floor.L),pW=mxFN(MX.floor.W),sc=Math.min(300/Math.max(pL,.1),150/Math.max(pW,.1),40),sw=pL*sc,sh=pW*sc,ox=(340-sw)/2,oy=(170-sh)/2;
    body+='<div class="plan-canv"><svg viewBox="0 0 340 170" style="width:100%;height:100%"><rect x="'+ox+'" y="'+oy+'" width="'+sw+'" height="'+sh+'" fill="rgba(184,150,78,.07)" stroke="#B8964E" stroke-width="1.5" rx="2"/><text x="'+(ox+sw/2)+'" y="'+(oy+sh/2)+'" text-anchor="middle" dominant-baseline="middle" font-family="DM Sans,sans-serif" font-size="11" fill="#B8964E">'+pL.toFixed(1)+' x '+pW.toFixed(1)+'m = '+fa.toFixed(1)+'m2</text></svg></div></div>';
    body+='<div class="cd"><div class="ct">Wall dimensions <span style="font-size:10px;font-weight:400;color:var(--mu)">Tick External for outer masonry / ext stud walls</span></div>';
    body+='<div style="display:grid;grid-template-columns:1.2fr .8fr .8fr 88px 28px;gap:6px;padding:4px 0 6px;font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em"><span>Label</span><span>Length (m)</span><span>Height (m)</span><span style="text-align:center">External?</span><span></span></div>';
    MX.walls.forEach((w,i)=>{body+='<div style="display:grid;grid-template-columns:1.2fr .8fr .8fr 88px 28px;gap:6px;align-items:center;margin-bottom:6px"><input value="'+w.label+'" style="font-size:12px;padding:6px 8px;border:1px solid var(--bd);border-radius:4px;background:rgba(255,255,255,.06);color:var(--w);font-family:\'DM Sans\',sans-serif" onchange="MX.walls['+i+'].label=this.value"/><input type="number" value="'+w.L+'" step=".1" min=".5" style="font-size:12px;padding:6px 8px;border:1px solid var(--bd);border-radius:4px;background:rgba(255,255,255,.06);color:var(--w);font-family:\'DM Sans\',sans-serif;width:100%" onchange="MX.walls['+i+'].L=+this.value;rMX()"/><input type="number" value="'+w.H+'" step=".05" min="1" style="font-size:12px;padding:6px 8px;border:1px solid var(--bd);border-radius:4px;background:rgba(255,255,255,.06);color:var(--w);font-family:\'DM Sans\',sans-serif;width:100%" onchange="MX.walls['+i+'].H=+this.value;rMX()"/><div style="text-align:center"><label style="display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;font-size:11px;color:#ccc"><input type="checkbox" '+(w.ext?'checked':'')+' onchange="MX.walls['+i+'].ext=this.checked;rMX()" style="accent-color:var(--g);width:13px;height:13px"/> Ext</label></div><button class="del-btn" onclick="MX.walls.splice('+i+',1);rMX()">X</button></div>';});
    body+='<button class="add-btn" onclick="MX.walls.push({label:\'New wall\',L:3,H:MX.ceilingH||2.4,ext:true});rMX()">+ Add wall</button></div>';
  }

  if(mxTab===2){
    body+='<div class="cd"><div class="ct">Wall construction</div><div class="trow">'+[['cavity','Cavity masonry (brick + block)'],['solid','Solid block'],['timber','Timber frame (CLS stud)']].map(([k,l])=>'<div class="tog'+(MX.wallType===k?' on':'')+'" onclick="MX.wallType=\''+k+'\';rMX()">'+l+'</div>').join('')+'</div><div class="tgl">Stud / joist spacing</div><div class="trow">'+[400,450,600].map(s=>'<div class="tog'+(MX.studSpacing===s?' on':'')+'" onclick="MX.studSpacing='+s+';MX.joistSpacing='+s+';MX.rafterSpacing='+s+';rMX()">'+s+'mm c/c</div>').join('')+'</div></div>';
    body+='<div class="cd"><div class="ct">Floor construction</div><div class="trow">'+[['concrete','Concrete slab'],['timber','Timber suspended floor']].map(([k,l])=>'<div class="tog'+(MX.floorType===k?' on':'')+'" onclick="MX.floorType=\''+k+'\';rMX()">'+l+'</div>').join('')+'</div></div>';
    body+='<div class="cd"><div class="ct">Roof type and dimensions</div><div class="trow">'+[['flat','Flat roof (EPDM)'],['pitched','Pitched (tiled)']].map(([k,l])=>'<div class="tog'+(MX.roofType===k?' on':'')+'" onclick="MX.roofType=\''+k+'\';rMX()">'+l+'</div>').join('')+'</div><div class="g4" style="margin-top:.65rem"><div class="f"><label>Roof span (m)</label><input type="number" value="'+MX.roof.span+'" step=".1" onchange="MX.roof.span=+this.value;rMX()"/></div><div class="f"><label>Roof length (m)</label><input type="number" value="'+MX.roof.length+'" step=".1" onchange="MX.roof.length=+this.value;rMX()"/></div><div class="f"><label>Eaves overhang (m)</label><input type="number" value="'+MX.roof.overhang+'" step=".05" onchange="MX.roof.overhang=+this.value;rMX()"/></div>'+(MX.roofType==='pitched'?'<div class="f"><label>Pitch (deg)</label><input type="number" value="'+MX.roof.pitch+'" step="1" min="10" max="60" onchange="MX.roof.pitch=+this.value;rMX()"/></div>':'<div class="f"><label>Roof area</label><input readonly value="'+ra.toFixed(1)+'m2" style="opacity:.5"/></div>')+'</div>'+(MX.roofType==='pitched'?'<div class="ib">Rafter length: '+mxRL().toFixed(2)+'m - Roof area inc overhang: '+ra.toFixed(1)+'m2</div>':'')+'</div>';
    body+='<div class="cd"><div class="ct">Internal linings</div><label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:12px;color:#ccc"><input type="checkbox" '+(MX.plaster?'checked':'')+' onchange="MX.plaster=this.checked;rMX()" style="accent-color:var(--g);width:14px;height:14px"/> Include plasterboard, skim coat and bonding adhesive</label></div>';
  }

  if(mxTab===3){
    if(MX.aiState==='done'&&MX.openings.length)body+='<div class="ib green">Openings pre-filled from AI. Verify sizes are correct.</div>';
    body+='<div class="ib">Openings are deducted from external wall brickwork. Lintels are added automatically.</div>';
    body+='<div class="cd"><div class="ct">Add opening</div><div class="g4" style="margin-bottom:.75rem"><div class="f"><label>Label</label><input id="mxOL" value="Bifolding doors"/></div><div class="f"><label>Width (m)</label><input id="mxOW" type="number" step=".05" value="2.4" min=".3"/></div><div class="f"><label>Height (m)</label><input id="mxOH" type="number" step=".05" value="2.1" min=".3"/></div><div class="f"><label>Qty</label><input id="mxOQ" type="number" value="1" min="1"/></div></div><button class="add-btn" onclick="mxAddOpening()">+ Add opening</button></div>';
    if(MX.openings.length){body+='<div class="cd"><div class="ct">Openings schedule</div><table class="mtbl2"><thead><tr><th>Opening</th><th>Width</th><th>Height</th><th>Qty</th><th>Area</th><th>Lintel</th><th></th></tr></thead><tbody>';MX.openings.forEach((o,i)=>{body+='<tr><td>'+o.label+'</td><td>'+mxFN(o.W).toFixed(2)+'m</td><td>'+mxFN(o.H).toFixed(2)+'m</td><td>'+o.qty+'</td><td>'+(mxFN(o.W)*mxFN(o.H)*o.qty).toFixed(2)+'m2</td><td style="color:var(--g)">'+o.qty+' nr</td><td><button class="del-btn" onclick="MX.openings.splice('+i+',1);rMX()">X</button></td></tr>';});body+='<tr style="font-weight:600;background:rgba(184,150,78,.07)"><td colspan="4">Total deduction</td><td colspan="3">'+mxOA().toFixed(2)+'m2</td></tr></tbody></table></div>';}
  }

  if(mxTab===4){
    const mats=mxCalc(),cats=[...new Set(mats.map(m=>m.cat))];
    body+='<div class="ms"><div class="mc"><div class="ml">Floor area</div><div class="mv go">'+fa.toFixed(1)+'m2</div></div><div class="mc"><div class="ml">Ext wall net</div><div class="mv">'+ewn.toFixed(1)+'m2</div></div><div class="mc"><div class="ml">Openings</div><div class="mv">'+MX.openings.length+' nr</div></div><div class="mc"><div class="ml">Wastage</div><div class="mv rd">+10%</div></div><div class="mc"><div class="ml">Line items</div><div class="mv bl">'+mats.length+'</div></div><div class="mc"><div class="ml">Source</div><div class="mv" style="color:'+(MX.aiState==='done'?'var(--gn)':'var(--mu)')+'">'+(MX.aiState==='done'?'AI':'Manual')+'</div></div></div>';
    body+='<div class="ib">All quantities include +10% wastage. '+MX.floor.L+'x'+MX.floor.W+'m floor - '+MX.wallType+' walls - '+MX.roofType+' roof - '+MX.floorType+' floor'+(MX.aiState==='done'?' - AI-extracted from drawings':'')+'.</div>';
    body+='<div class="cd" style="padding:0;overflow:hidden"><table class="mtbl2"><thead><tr><th style="min-width:190px">Material / item</th><th>Unit</th><th>Qty incl +10%</th><th style="text-align:left;min-width:120px">Basis</th><th style="text-align:left">Note</th></tr></thead><tbody>';
    cats.forEach(cat=>{body+='<tr class="mcat"><td colspan="5">'+cat+'</td></tr>';mats.filter(m=>m.cat===cat).forEach(m=>{body+='<tr><td style="font-size:11px">'+m.item+'</td><td style="color:var(--mu)">'+m.unit+'</td><td><span class="qty-badge">'+(typeof m.qty==='number'?m.qty.toLocaleString('en-GB'):m.qty)+'</span></td><td style="text-align:left;font-size:10px;color:var(--mu)">'+(m.basis||'-')+'</td><td style="text-align:left;font-size:10px;color:var(--mu)">'+(m.note||'')+'</td></tr>';});});
    body+='</tbody></table></div><div class="ib blue" style="margin-top:.9rem">All quantities are calculated from the dimensions entered. Structural specifications must be confirmed by a structural engineer. Verify against drawings before ordering. Prepared by Signature Construction Projects Ltd.</div>';
  }

  document.getElementById('v5').innerHTML=wrap('Materials Calculator','Upload drawings - AI dimension extraction - Full materials schedule - +10% wastage',met+stabs+body,5,'<button class="bg" onclick="mxPDF()">Materials Schedule PDF</button><button class="bg" onclick="mxCSV()">CSV Merchant List</button>');
}

function mxPDF(){
  const mats=mxCalc(),cats=[...new Set(mats.map(m=>m.cat))];
  let rows='';
  cats.forEach(cat=>{
    rows+='<tr style="background:#f5f0e8"><td colspan="4" style="font-weight:700;font-size:10px;text-transform:uppercase;color:#888;padding:5px 8px">'+cat+'</td></tr>';
    mats.filter(m=>m.cat===cat).forEach(m=>{
      rows+='<tr><td style="padding:5px 8px">'+m.item+'</td><td style="padding:5px 8px;text-align:right">'+m.unit+'</td><td style="padding:5px 8px;text-align:right;font-weight:600">'+(typeof m.qty==='number'?m.qty.toLocaleString():m.qty)+'</td><td style="padding:5px 8px;font-size:10px;color:#888">'+m.note+'</td></tr>';
    });
  });
  const client=MX.client||'Client';
  const proj=MX.proj||'Project';
  const dateStr=new Date().toLocaleDateString();
  const faStr=mxFA().toFixed(1);
  const sourceNote=MX.aiState==='done'?' | Source: AI-extracted from drawings':'';
  const w=window.open('','_blank');
  if(w){
    const parts=[
      '\u003c!DOCTYPE html\u003e',
      '\u003chtml\u003e\u003chead\u003e<title>Materials Schedule</title>\u003c/head\u003e',
      '\u003cbody style="font-family:Georgia,serif;color:#2c2c2a;max-width:900px;margin:30px auto;padding:0 20px">',
      '<h2 style="font-size:22px;color:#b8964e;letter-spacing:.1em;font-weight:700;margin:0 0 3px">SIGNATURE CONSTRUCTION PROJECTS LTD</h2>',
      '<p style="font-size:11px;color:#888;letter-spacing:.15em;margin:0 0 16px">Quantity Surveying Consultancy</p>',
      '<h1 style="font-size:20px;margin:0 0 3px">Extension Materials Schedule</h1>',
      '<p style="font-size:12px;color:#6b6960;margin:0 0 14px">'+client+' - '+proj+' - '+dateStr+'</p>',
      '<p style="background:#f9f7f2;border:1px solid #e8e3da;padding:9px 14px;border-radius:4px;font-size:11px;margin-bottom:14px">',
      '<strong>Floor area:</strong> '+faStr+'m2 ('+MX.floor.L+'x'+MX.floor.W+'m) | ',
      '<strong>Walls:</strong> '+MX.wallType+' | <strong>Roof:</strong> '+MX.roofType+' | <strong>Wastage:</strong> +10%'+sourceNote,
      '</p>',
      '<table style="width:100%;border-collapse:collapse;font-size:11px;margin:10px 0">',
      '<thead><tr>',
      '<th style="background:#1a1a18;color:#b8964e;padding:6px 8px;font-size:10px;text-align:left;min-width:200px">Material</th>',
      '<th style="background:#1a1a18;color:#b8964e;padding:6px 8px;font-size:10px;text-align:right">Unit</th>',
      '<th style="background:#1a1a18;color:#b8964e;padding:6px 8px;font-size:10px;text-align:right">Qty</th>',
      '<th style="background:#1a1a18;color:#b8964e;padding:6px 8px;font-size:10px;text-align:left">Note</th>',
      '</tr></thead><tbody>',
      rows,
      '</tbody></table>',
      '<p style="font-size:10px;color:#888;margin-top:14px;border-top:1px solid #e8e3da;padding-top:9px">',
      'All quantities include +10% wastage. Structural specifications must be confirmed by a structural engineer.',
      ' Prepared by Signature Construction Projects Ltd.</p>',
      '\u003c/body\u003e\u003c/html\u003e'
    ];
    w.document.write(parts.join(''));w.document.close();w.onload=()=>w.print();
  }
}

function mxCSV(){
  const mats=mxCalc();
  let csv='Extension Materials Schedule\nProject,'+MX.proj+'\nClient,'+MX.client+'\nDate,'+new Date().toLocaleDateString('en-GB')+'\nFloor area,'+mxFA().toFixed(1)+'m2\nWastage,+10%\nSource,'+(MX.aiState==='done'?'AI-extracted from drawings':'Manual entry')+'\n\nCategory,Material / Item,Unit,Qty (incl wastage),Basis,Note\n';
  mats.forEach(m=>{csv+='"'+m.cat+'","'+m.item+'","'+m.unit+'","'+m.qty+'","'+(m.basis||'')+'","'+(m.note||'')+'"\n';});
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='Materials_'+(MX.proj||'Project').replace(/\s+/g,'_')+'.csv';a.click();
}


/* \u2500\u2500 SHARED INLINE MATERIALS RENDERER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Called from SP, HB, FS, EX tools. Each tool has its own MX state.
   States: MX_sp, MX_hb, MX_fs, MX_ex
   Each mirrors the standalone MX object structure.
*/

function mkMXState(){
  return {
    proj:'',client:'',wallType:'cavity',roofType:'flat',floorType:'concrete',
    ceilingH:2.4,studSpacing:400,joistSpacing:400,rafterSpacing:400,plaster:true,
    walls:[],openings:[],
    roof:{span:4.0,length:4.0,pitch:15,overhang:.45},
    floor:{L:4.0,W:4.0},
    uploadedFiles:[],drawingImages:[],rawFiles:[],
    aiState:'idle',aiLog:[],extracted:{},confidence:{},
    tab:0,
    rooms:[],kitchenDesign:null,bathroomDesigns:[],
    kbAiState:'idle',kbAiLog:[]
  };
}

const MXS={sp:mkMXState(),hb:mkMXState(),fs:mkMXState(),ex:mkMXState()};

function getMX(ctx){return MXS[ctx]||MXS.sp;}

function mxiFA(m){return mxFN(m.floor.L)*mxFN(m.floor.W);}
function mxiEWN(m){const g=m.walls.filter(w=>w.ext).reduce((t,w)=>t+mxFN(w.L)*mxFN(w.H),0);const o=m.openings.reduce((t,o2)=>t+mxFN(o2.W)*mxFN(o2.H)*mxFN(o2.qty),0);return Math.max(0,g-o);}
function mxiAWA(m){return mxiEWN(m)+m.walls.filter(w=>!w.ext).reduce((t,w)=>t+mxFN(w.L)*mxFN(w.H),0);}
function mxiPerim(m){return m.walls.reduce((t,w)=>t+mxFN(w.L),0);}
function mxiOA(m){return m.openings.reduce((t,o2)=>t+mxFN(o2.W)*mxFN(o2.H)*mxFN(o2.qty),0);}
function mxiRA(m){
  const sp=mxFN(m.roof.span),ln=mxFN(m.roof.length),pt=mxFN(m.roof.pitch),ov=mxFN(m.roof.overhang);
  if(m.roofType==='flat')return(sp+ov*2)*(ln+ov*2);
  const pr=pt*(Math.PI/180);return((sp/2)/Math.cos(pr))*2*(ln+ov*2);
}
function mxiRL(m){const sp=mxFN(m.roof.span),pt=mxFN(m.roof.pitch),ov=mxFN(m.roof.overhang);return(sp/2)/Math.cos(pt*(Math.PI/180))+ov;}

function mxiCalc(m){
  const fa=mxiFA(m),ewn=mxiEWN(m),awa=mxiAWA(m),perim=mxiPerim(m),ra=mxiRA(m),cH=mxFN(m.ceilingH);
  const ss=mxFN(m.studSpacing)/1000,js=mxFN(m.joistSpacing)/1000,rs=mxFN(m.rafterSpacing)/1000;
  const sp=mxFN(m.roof.span),rln=mxFN(m.roof.length),ov=mxFN(m.roof.overhang);

  // Use extracted spec data if available
  const extSpec=m.extractedSpec||{};
  const studMm=extSpec.internal_stud_mm||63;
  const boardMm=extSpec.internal_board_mm||12.5;
  const boardLayers=extSpec.internal_board_layers||1;
  const isSoundbloc=boardMm>=15||(extSpec.internal_board_type||'').toLowerCase().includes('sound');
  const boardItem=isSoundbloc?'Gyproc Soundbloc '+boardMm+'mm':'Plasterboard '+boardMm+'mm TE';
  const boardArea=1.2*2.4; // standard board 2.88m2

  const mats=[];

  // \u2500\u2500 EXTERNAL WALLS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if(m.wallType==='cavity'){
    mats.push({cat:'Masonry',item:'Engineering bricks (outer leaf)',qty:Math.ceil(ewn*59*MXW),unit:'nr',note:'59/m2 stretcher bond',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Mortar brickwork (25kg bags)',qty:Math.ceil(ewn*0.5*MXW),unit:'bags',note:'0.5 bags/m2',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Concrete blocks 100mm dense (inner leaf)',qty:Math.ceil(awa*7.26*MXW),unit:'nr',note:'7.26 blocks/m2',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Mortar blockwork (25kg bags)',qty:Math.ceil(awa*0.35*MXW),unit:'bags',note:'0.35 bags/m2',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Stainless steel wall ties',qty:Math.ceil(ewn*2.5*MXW),unit:'nr',note:'2.5/m2',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Cavity wall insulation batts 100mm',qty:mxF2(ewn*MXW),unit:'m2',note:'Full-fill PIR',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'DPC 150mm',qty:mxF2(perim*MXW),unit:'m',note:'Base ext walls',basis:perim.toFixed(1)+'m'});
  }else if(m.wallType==='solid'){
    mats.push({cat:'Masonry',item:'Concrete blocks 100mm dense',qty:Math.ceil(awa*7.26*2*MXW),unit:'nr',note:'Two leaves',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'Mortar (25kg bags)',qty:Math.ceil(awa*0.7*MXW),unit:'bags',note:'Both leaves',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Masonry',item:'DPC 150mm',qty:mxF2(perim*MXW),unit:'m',note:'Base ext walls',basis:perim.toFixed(1)+'m'});
    mats.push({cat:'Masonry',item:'Wall insulation 100mm PIR',qty:mxF2(ewn*MXW),unit:'m2',note:'Internal face',basis:ewn.toFixed(1)+'m2'});
  }else{
    const sLin=awa*((1/ss)*cH+2+(1/0.6));
    mats.push({cat:'Timber Frame',item:'CLS '+studMm+'mm studs/plates/noggings',qty:Math.ceil(sLin*MXW),unit:'lin m',note:'At '+m.studSpacing+'mm c/c incl plates & noggings',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Timber Frame',item:'OSB3 11mm sheathing',qty:mxF2(ewn*MXW),unit:'m2',note:'Ext face',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Timber Frame',item:'Breather membrane',qty:mxF2(ewn*MXW),unit:'m2',note:'Over sheathing',basis:ewn.toFixed(1)+'m2'});
    mats.push({cat:'Timber Frame',item:'Vapour control layer',qty:mxF2(awa*MXW),unit:'m2',note:'Internal face',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Timber Frame',item:'Wall insulation 100mm PIR',qty:mxF2(ewn*MXW),unit:'m2',note:'Between studs',basis:ewn.toFixed(1)+'m2'});
  }

  // \u2500\u2500 INTERNAL PARTITION WALLS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Calculate from internal walls array
  const intWalls=m.walls.filter(w=>!w.ext);
  if(intWalls.length>0){
    const intWallArea=intWalls.reduce((t,w)=>t+mxFN(w.L)*mxFN(w.H),0);
    const intPerim=intWalls.reduce((t,w)=>t+mxFN(w.L),0);
    // Stud calculation: (wall area / stud spacing * height) + plates (2 per run) + noggings (1 per 600mm height)
    const studH=cH;
    const studsPerMetre=1/ss;
    const noggingsPerMetre=Math.ceil(studH/0.6)-1;
    const linearPerM2=studsPerMetre*studH + 2 + noggingsPerMetre; // studs + top&bottom plate + noggings
    const intStudLin=intWallArea*linearPerM2;
    mats.push({cat:'Internal Walls',item:'CLS '+studMm+'x89mm studs/plates/noggings',qty:Math.ceil(intStudLin*MXW),unit:'lin m',note:studMm+'mm studs at '+m.studSpacing+'mm c/c + plates + noggings',basis:intWallArea.toFixed(1)+'m2 internal walls'});
    mats.push({cat:'Internal Walls',item:boardItem+' (both faces)',qty:Math.ceil(intWallArea*2*boardLayers*MXW/boardArea),unit:'nr',note:boardMm+'mm '+boardLayers+' layer(s) both faces',basis:intWallArea.toFixed(1)+'m2 x2 faces'});
    mats.push({cat:'Internal Walls',item:'Head/sole plates 47x'+(studMm+26)+'mm sw',qty:Math.ceil(intPerim*2*MXW),unit:'lin m',note:'Top and bottom plates',basis:intPerim.toFixed(1)+'m run x2'});
    mats.push({cat:'Internal Walls',item:'Acoustic mineral wool insulation',qty:mxF2(intWallArea*MXW),unit:'m2',note:'Between studs party/bathroom walls',basis:intWallArea.toFixed(1)+'m2'});
    mats.push({cat:'Internal Walls',item:'Metal angle bead',qty:Math.ceil(intPerim*2*cH/3*MXW),unit:'nr',note:'Corner beads at junctions',basis:'Corners'});
  } else {
    // Estimate internal walls from floor area if none defined
    const estIntWallArea=fa*1.8; // rule of thumb: internal wall area \u2248 1.8x floor area for typical house
    const estIntPerim=fa*0.6;
    const studH=cH;
    const studsPerMetre=1/ss;
    const noggingsPerMetre=Math.ceil(studH/0.6)-1;
    const linearPerM2=studsPerMetre*studH + 2 + noggingsPerMetre;
    const intStudLin=estIntWallArea*linearPerM2;
    mats.push({cat:'Internal Walls',item:'CLS '+studMm+'x89mm studs/plates/noggings (estimated)',qty:Math.ceil(intStudLin*MXW),unit:'lin m',note:'Estimated from floor area \u2014 add internal walls in Dimensions tab for accuracy',basis:'Est. '+estIntWallArea.toFixed(0)+'m2'});
    mats.push({cat:'Internal Walls',item:boardItem+' (both faces, estimated)',qty:Math.ceil(estIntWallArea*2*boardLayers*MXW/boardArea),unit:'nr',note:boardMm+'mm '+boardLayers+' layer(s) \u2014 estimated',basis:'Est. '+estIntWallArea.toFixed(0)+'m2'});
  }

  // \u2500\u2500 FLOOR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if(m.floorType==='concrete'){
    mats.push({cat:'Floor (Concrete)',item:'Sharp sand blinding 50mm',qty:mxF2(fa*0.05*MXW),unit:'m3',note:'Below DPM',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'DPM 300mu polythene',qty:mxF2(fa*MXW),unit:'m2',note:'Below insulation',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'Floor insulation 100mm PIR',qty:mxF2(fa*MXW),unit:'m2',note:'Meets Part L',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'Ready-mix concrete C25 100mm slab',qty:mxF2(fa*0.1*MXW),unit:'m3',note:'Ground bearing',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Concrete)',item:'A142 steel mesh',qty:mxF2(fa*MXW),unit:'m2',note:'200x200mm 3.55kg/m2',basis:fa.toFixed(1)+'m2'});
  }else{
    const nJ=Math.ceil(mxFN(m.floor.W)/js)+1;
    mats.push({cat:'Floor (Timber)',item:'Joists 47x195mm C24',qty:Math.ceil(nJ*mxFN(m.floor.L)*MXW),unit:'lin m',note:'At '+m.joistSpacing+'mm c/c',basis:nJ+' joists'});
    mats.push({cat:'Floor (Timber)',item:'Joist hangers galv steel',qty:Math.ceil(nJ*2*MXW),unit:'nr',note:'Both ends',basis:nJ+' joists'});
    mats.push({cat:'Floor (Timber)',item:'Floor insulation 100mm',qty:mxF2(fa*MXW),unit:'m2',note:'Between joists',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Timber)',item:'DPM 300mu polythene',qty:mxF2(fa*MXW),unit:'m2',note:'Below insulation',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Floor (Timber)',item:'T&G chipboard 22mm',qty:mxF2(fa*MXW),unit:'m2',note:'Glued and screwed',basis:fa.toFixed(1)+'m2'});
  }

  // \u2500\u2500 ROOF \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if(m.roofType==='flat'){
    const nRJ=Math.ceil(rln/js)+1;
    mats.push({cat:'Roof (Flat)',item:'Flat roof joists 47x175mm C24',qty:Math.ceil(nRJ*(sp+ov*2)*MXW),unit:'lin m',note:'At '+m.rafterSpacing+'mm c/c',basis:rln.toFixed(1)+'m run'});
    mats.push({cat:'Roof (Flat)',item:'Firring pieces tapered 1:60',qty:Math.ceil(nRJ*(sp+ov*2)*MXW),unit:'lin m',note:'Drainage fall',basis:rln.toFixed(1)+'m run'});
    mats.push({cat:'Roof (Flat)',item:'OSB3 18mm roof deck',qty:mxF2(ra*MXW),unit:'m2',note:'Structural deck',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'VCL',qty:mxF2(ra*MXW),unit:'m2',note:'Below insulation',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'PIR insulation 150mm warm roof',qty:mxF2(ra*MXW),unit:'m2',note:'100+50mm staggered',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'EPDM membrane 1.2mm',qty:mxF2(ra*MXW),unit:'m2',note:'Fully bonded',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Flat)',item:'Aluminium drip edge trim',qty:mxF2((2*(sp+ov*2)+2*(rln+ov*2))*MXW),unit:'lin m',note:'Perimeter',basis:'Perimeter'});
  }else{
    const rl=mxiRL(m),nR=Math.ceil((rln+ov*2)/rs)*2+2;
    mats.push({cat:'Roof (Pitched)',item:'Rafters 47x150mm C24',qty:Math.ceil(nR*rl*MXW),unit:'lin m',note:'At '+m.rafterSpacing+'mm c/c',basis:nR+' rafters'});
    mats.push({cat:'Roof (Pitched)',item:'Ridge board 47x225mm',qty:Math.ceil((rln+ov*2)*MXW),unit:'lin m',note:'Full length',basis:(rln+ov*2).toFixed(1)+'m'});
    const nC=Math.ceil(rln/0.6);
    mats.push({cat:'Roof (Pitched)',item:'Collar ties 47x120mm',qty:Math.ceil(nC*sp*MXW),unit:'lin m',note:'At 600mm c/c',basis:nC+' x '+sp.toFixed(1)+'m'});
    mats.push({cat:'Roof (Pitched)',item:'Roofing underlay',qty:mxF2(ra*MXW),unit:'m2',note:'Over rafters',basis:ra.toFixed(1)+'m2'});
    const bL=Math.ceil(rl/0.345)*(rln+ov*2)*2;
    mats.push({cat:'Roof (Pitched)',item:'Tiling battens 25x50mm',qty:Math.ceil(bL*MXW),unit:'lin m',note:'345mm gauge',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Pitched)',item:'Roof tiles concrete interlocking',qty:Math.ceil(ra*10*MXW),unit:'nr',note:'~10/m2',basis:ra.toFixed(1)+'m2'});
    mats.push({cat:'Roof (Pitched)',item:'Ridge tiles half-round',qty:Math.ceil((rln+ov*2)/0.3*MXW),unit:'nr',note:'~3.3/lin m',basis:(rln+ov*2).toFixed(1)+'m'});
    mats.push({cat:'Roof (Pitched)',item:'PIR insulation 150mm between rafters',qty:mxF2(ra*MXW),unit:'m2',note:'Cut between + 50mm over',basis:ra.toFixed(1)+'m2'});
  }

  // \u2500\u2500 BOARDS & LININGS (external walls) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if(m.plaster){
    const pbW=m.wallType==='timber'?awa*2:awa;
    const ceilBoards=Math.ceil(fa*MXW/boardArea);
    const wallBoards=Math.ceil(pbW*MXW/boardArea);
    mats.push({cat:'Boards & Linings',item:boardItem+' ceiling',qty:ceilBoards,unit:'nr',note:boardMm+'mm \u2014 '+boardArea+'m2 per board',basis:fa.toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:boardItem+' walls (ext leaf lining)',qty:wallBoards,unit:'nr',note:boardMm+'mm '+boardLayers+' layer(s)',basis:pbW.toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:'Plasterboard dab adhesive (25kg)',qty:Math.ceil(awa/2*MXW),unit:'bags',note:'1 bag per 2m2',basis:awa.toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:'Jointing tape and filler',qty:Math.ceil((pbW+fa)*MXW/20),unit:'rolls/bags',note:'1 per 20m2',basis:(pbW+fa).toFixed(1)+'m2'});
    mats.push({cat:'Boards & Linings',item:'Finishing plaster skim (25kg)',qty:Math.ceil((awa+fa)*1.5/25*MXW),unit:'bags',note:'1.5kg/m2',basis:(awa+fa).toFixed(1)+'m2'});
  }

  // \u2500\u2500 STRUCTURAL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if(m.openings.length>0){
    var doors=m.openings.filter(function(o){return /^D\d/i.test(o.label)||mxFN(o.H)>=2.0;});
    var wins=m.openings.filter(function(o){return /^W\d/i.test(o.label)||(mxFN(o.H)>0.3&&mxFN(o.H)<2.0);});
    if(!wins.length&&!doors.length){wins=m.openings;}

    // Lintel schedule — width + 300mm bearing (150mm each side)
    var lintelGroups={};
    m.openings.forEach(function(o){
      var w=mxFN(o.W);if(!w)return;
      var len=Math.ceil((w+0.3)*1000/50)*50;
      lintelGroups[len]=(lintelGroups[len]||0)+(o.qty||1);
    });
    Object.keys(lintelGroups).sort(function(a,b){return a-b;}).forEach(function(len){
      var qty=lintelGroups[len];
      mats.push({cat:'Structural',item:'Steel lintel '+len+'mm SB+ type',qty:Math.ceil(qty*MXW),unit:'nr',note:'Opening width + 300mm bearing (150mm each side)',basis:qty+' opening(s)'});
    });

    // Window cill schedule — cast stone, width + 300mm
    if(wins.length>0){
      var cillGroups={};
      wins.forEach(function(o){
        var w=mxFN(o.W);if(!w)return;
        var len=Math.ceil((w+0.3)*1000/50)*50;
        cillGroups[len]=(cillGroups[len]||0)+(o.qty||1);
      });
      Object.keys(cillGroups).sort(function(a,b){return a-b;}).forEach(function(len){
        var qty=cillGroups[len];
        mats.push({cat:'Structural',item:'Cast stone cill '+len+'mm',qty:Math.ceil(qty*MXW),unit:'nr',note:'Window width + 300mm bearing (150mm each side)',basis:qty+' window(s)'});
      });
      var totalCillRun=wins.reduce(function(t,o){return t+mxFN(o.W)+0.3;},0);
      mats.push({cat:'Structural',item:'Cill DPC / cavity tray 150mm',qty:mxF2(totalCillRun*MXW),unit:'lin m',note:'Under all window cills',basis:wins.length+' windows'});
    }

    // Head DPC / cavity tray over all openings
    var totalHeadRun=m.openings.reduce(function(t,o){return t+mxFN(o.W)+0.3;},0);
    mats.push({cat:'Structural',item:'Head DPC / cavity tray over openings',qty:mxF2(totalHeadRun*MXW),unit:'lin m',note:'Over all lintels',basis:m.openings.length+' openings'});
    mats.push({cat:'Structural',item:'Weep hole vents',qty:Math.ceil(m.openings.length*2*MXW),unit:'nr',note:'2 per opening min',basis:m.openings.length+' openings'});
  }
  if(m.wallType!=='timber'){
    mats.push({cat:'Structural',item:'Wall plate 75x100mm sw',qty:Math.ceil(perim*MXW),unit:'lin m',note:'Bedded in mortar',basis:perim.toFixed(1)+'m'});
    mats.push({cat:'Structural',item:'Restraint straps 30x5mm galv',qty:Math.ceil(perim/1.2*MXW),unit:'nr',note:'1 per 1.2m',basis:perim.toFixed(1)+'m'});
  }

  // \u2500\u2500 FIXINGS & SUNDRIES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  // ── RAINWATER GOODS ─────────────────────────────────────────────────────
  var fasciaRun=m.roofType==='pitched'?(rln+ov*2)*2+(sp+ov*2)*2:perim;
  var gutterRun=m.roofType==='pitched'?(rln+ov*2)*2:perim;
  var dpCount=Math.max(2,Math.ceil(gutterRun/12));
  var dpHeight=mxFN(m.ceilingH)*2*1.2; // two storeys approx x 1.2 for offsets
  mats.push({cat:'Rainwater Goods',item:'uPVC fascia board 150mm',qty:mxF2(fasciaRun*MXW),unit:'lin m',note:'Eaves + gable ends both sides',basis:fasciaRun.toFixed(1)+'m'});
  mats.push({cat:'Rainwater Goods',item:'uPVC soffit board 225mm vented',qty:mxF2(fasciaRun*MXW),unit:'lin m',note:'Continuous vented soffit at eaves',basis:fasciaRun.toFixed(1)+'m'});
  mats.push({cat:'Rainwater Goods',item:'uPVC half-round gutter 112mm',qty:mxF2(gutterRun*MXW),unit:'lin m',note:'Both eaves runs',basis:gutterRun.toFixed(1)+'m'});
  mats.push({cat:'Rainwater Goods',item:'Gutter angles, stop ends & unions',qty:Math.ceil((4+Math.ceil(gutterRun/4))*MXW),unit:'nr',note:'4 corners + unions at 4m centres',basis:'Est.'});
  mats.push({cat:'Rainwater Goods',item:'uPVC round downpipe 68mm',qty:mxF2(dpCount*dpHeight*MXW),unit:'lin m',note:'Inc. 20% for offsets',basis:dpCount+' downpipes'});
  mats.push({cat:'Rainwater Goods',item:'Downpipe shoes, offset bends & brackets',qty:Math.ceil(dpCount*3*MXW),unit:'nr',note:'Shoe + offset + brackets per downpipe',basis:dpCount+' downpipes'});


  // ── SECOND FIX JOINERY ──────────────────────────────────────────────────
  var doorOpenings=m.openings.filter(function(o){return /^D[0-9]/i.test(o.label)||mxFN(o.H)>=2.0;});
  var totalDoorWidth=doorOpenings.reduce(function(t,o){return t+mxFN(o.W);},0);
  var skirtingRun=Math.max(0,(perim*2.5)-totalDoorWidth);
  mats.push({cat:'Second Fix Joinery',item:'Skirting board 18x119mm MDF ogee',qty:mxF2(skirtingRun*MXW),unit:'lin m',note:'Internal perimeter less door openings +10% waste',basis:skirtingRun.toFixed(1)+'m'});
  mats.push({cat:'Second Fix Joinery',item:'Skirting external angle beads',qty:Math.ceil(perim/3*MXW),unit:'nr',note:'Est. 1 per 3m perimeter',basis:'Est.'});

  var archRun=doorOpenings.length>0
    ? doorOpenings.reduce(function(t,o){return t+(mxFN(o.H)*2+mxFN(o.W))*2;},0)
    : 0;
  if(archRun===0&&doorOpenings.length>0) archRun=doorOpenings.length*6.2*2;
  if(archRun>0) mats.push({cat:'Second Fix Joinery',item:'Architrave 15x69mm MDF ogee',qty:mxF2(archRun*MXW),unit:'lin m',note:'Both sides all door openings +10%',basis:doorOpenings.length+' doors x2 sides'});

  if(doorOpenings.length>0){
    mats.push({cat:'Second Fix Joinery',item:'Internal door lining set sw',qty:Math.ceil(doorOpenings.length*MXW),unit:'nr',note:'32x115mm head + 2 legs per door',basis:doorOpenings.length+' doors'});
    var bathroomDoors=Math.max(1,Math.round(doorOpenings.length*0.2));
    var standardDoors=doorOpenings.length-bathroomDoors;
    if(standardDoors>0){
      mats.push({cat:'Second Fix Joinery',item:'Internal door 35mm solid core flush',qty:Math.ceil(standardDoors*MXW),unit:'nr',note:'Pre-primed, to be painted',basis:standardDoors+' doors'});
      mats.push({cat:'Second Fix Joinery',item:'Lever handle on rose satin chrome',qty:Math.ceil(standardDoors*MXW),unit:'sets',note:'Pair per door',basis:standardDoors+' doors'});
      mats.push({cat:'Second Fix Joinery',item:'Tubular latch 63mm',qty:Math.ceil(standardDoors*MXW),unit:'nr',note:'1 per door',basis:standardDoors+' doors'});
      mats.push({cat:'Second Fix Joinery',item:'Butt hinges 76mm satin (x3)',qty:Math.ceil(standardDoors*3*MXW),unit:'nr',note:'3 per door',basis:standardDoors+' doors'});
      mats.push({cat:'Second Fix Joinery',item:'Door stops floor/wall mounted',qty:Math.ceil(standardDoors*MXW),unit:'nr',note:'1 per door',basis:standardDoors+' doors'});
    }
    if(bathroomDoors>0){
      mats.push({cat:'Second Fix Joinery',item:'Internal door 40mm solid core (bathroom)',qty:Math.ceil(bathroomDoors*MXW),unit:'nr',note:'Solid core for privacy',basis:bathroomDoors+' bathroom doors'});
      mats.push({cat:'Second Fix Joinery',item:'Bathroom lock set thumb turn & release',qty:Math.ceil(bathroomDoors*MXW),unit:'sets',note:'Privacy lock with emergency release',basis:bathroomDoors+' bathroom doors'});
      mats.push({cat:'Second Fix Joinery',item:'Bathroom lever handle with indicator bolt',qty:Math.ceil(bathroomDoors*MXW),unit:'sets',note:'Engaged/vacant indicator',basis:bathroomDoors+' bathroom doors'});
      mats.push({cat:'Second Fix Joinery',item:'Butt hinges 76mm satin (x3)',qty:Math.ceil(bathroomDoors*3*MXW),unit:'nr',note:'3 per bathroom door',basis:bathroomDoors+' doors'});
    }
  }

  mats.push({cat:'Fixings & Sundries',item:'Structural screws 5x100mm',qty:Math.ceil((fa+awa)/10*MXW),unit:'boxes',note:'All structural timber',basis:'By area'});
  mats.push({cat:'Fixings & Sundries',item:'Round nails 3.1x90mm',qty:Math.ceil((fa+awa)/20*MXW),unit:'boxes',note:'General framing',basis:'By area'});
  mats.push({cat:'Fixings & Sundries',item:'Expanding foam 750ml',qty:Math.ceil((m.openings.length*2+perim/5)*MXW),unit:'cans',note:'Around frames',basis:'Openings + perimeter'});
  mats.push({cat:'Fixings & Sundries',item:'Silicone sealant 310ml',qty:Math.ceil((m.openings.length*2+perim/8)*MXW),unit:'nr',note:'Around all frames',basis:'Openings + perimeter'});

  return mats;
}

/* \u2500\u2500 INLINE MATERIALS RENDERER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
function setMXITab(ctx,i){getMX(ctx).tab=i;renderMXInline_refresh(ctx);}
function renderMXInline_refresh(ctx){
  if(ctx==='sp')rSP();
  else if(ctx==='hb')rHB();
  else if(ctx==='fs')rFS();
  else if(ctx==='ex')rEX();

}

function renderMXInline(ctx){
  const m=getMX(ctx);
  const fa=mxiFA(m),ewn=mxiEWN(m),ra=mxiRA(m),perim=mxiPerim(m);
  const tabs=['Upload Drawings','Dimensions','Spec & Roof','Openings','Schedule','Kitchen & Bathroom'];
  const sq=JSON.stringify; // use JSON.stringify for safe ctx insertion in onclick

  // Subtabs
  let stabs='<div class="subtabs">';
  tabs.forEach(function(l,i){
    stabs+='<button class="stab'+(m.tab===i?' active':'')+'"';
    stabs+=' data-ctx='+ctx+' data-i='+i+' onclick="window.mxTabClick(this)">';
    stabs+=l+'</button>';
  });
  stabs+='</div>';

  // Metrics bar
  let body='<div class="ms">';
  body+='<div class="mc"><div class="ml">Floor area</div><div class="mv go">'+fa.toFixed(1)+'m\u00b2</div></div>';
  body+='<div class="mc"><div class="ml">Ext wall net</div><div class="mv">'+ewn.toFixed(1)+'m\u00b2</div></div>';
  body+='<div class="mc"><div class="ml">All walls</div><div class="mv">'+mxiAWA(m).toFixed(1)+'m\u00b2</div></div>';
  body+='<div class="mc"><div class="ml">Perimeter</div><div class="mv">'+perim.toFixed(1)+'m</div></div>';
  body+='<div class="mc"><div class="ml">Roof area</div><div class="mv">'+ra.toFixed(1)+'m\u00b2</div></div>';
  body+='<div class="mc"><div class="ml">Openings</div><div class="mv">'+m.openings.length+' nr</div></div>';
  body+='</div>';

  if(m.tab===0){
    body+='<div class="cd"><div class="ct">Upload architect\'s drawings</div>';
    var mxInputId='mxFile_'+ctx;
    body+='<div class="upload-zone"';
    body+=' ondragover="event.preventDefault();this.classList.add(\'drag\')"';
    body+=' ondragleave="this.classList.remove(\'drag\')"';
    body+=' data-ctx='+ctx+' ondrop="event.preventDefault();window.mxDrop(this,event)">';
    body+='<div style="font-size:2rem;margin-bottom:.5rem">&#128208;</div>';
    body+='<div style="font-size:.9rem;font-weight:600;margin-bottom:.3rem">Drop drawings here</div>';
    body+='<div style="font-size:.75rem;color:var(--mu);margin-bottom:.75rem">or click Browse to select files</div>';
    body+='<label style="display:inline-block;padding:6px 18px;background:rgba(184,150,78,.15);border:1px solid var(--g);color:var(--g);font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;border-radius:3px;cursor:pointer">';
    body+='Browse files<input type="file" id="'+mxInputId+'" data-ctx="'+ctx+'" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple style="position:absolute;left:-9999px" onchange="window.mxFileChanged(this)"/>';
    body+='</label>';
    body+='</div>';

    if(m.uploadedFiles.length>0){
      body+='<div style="margin-top:.75rem">';
      m.uploadedFiles.forEach(function(f){
        body+='<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(184,150,78,.06);font-size:11px">';
        body+='<span>&#128196;</span><span style="flex:1;color:#ccc">'+f.name+'</span>';
        body+='<span style="color:var(--mu)">'+(f.size/1024).toFixed(0)+'KB</span></div>';
      });
      body+='</div>';
      if(m.aiState==='idle'||m.aiState==='error'){
        body+='<button class="bg" style="background:var(--bl);color:#fff;margin-top:.75rem;width:100%;padding:.75rem"';
        body+=' data-ctx="'+ctx+'" onclick="window.mxAnalyseClick(this)">Analyse drawings with AI</button>';

      }
      body+='<div class="ib blue" style="margin-top:.6rem">';
      body+='<strong>What AI extracts reliably:</strong> Floor areas, door &amp; window schedules, room names, ceiling heights, wall construction, roof type.<br><br>';
      body+='<strong>Enter manually after:</strong> Overall building length &amp; width in the Dimensions tab.</div>';
    }
    body+='</div>';

    if(m.aiState==='processing'||m.aiState==='done'||m.aiState==='error'){
      body+='<div class="ai-panel">';
      body+='<div class="ai-title">';
      body+=(m.aiState==='processing'?'<div class="ai-spinner"></div>':'AI')+' ';
      body+=(m.aiState==='processing'?'Analysing drawings...':'Extraction complete');
      body+='</div>';
      body+='<div class="ai-log">';
      m.aiLog.forEach(function(l){
        body+='<div class="astep '+l.type+'">';
        body+=(l.type==='done'?'done':l.type==='warn'?'warn':'-')+' '+l.msg;
        body+='</div>';
      });
      body+='</div>';

      if(m.aiState==='done'&&m.extracted&&Object.keys(m.extracted).length>0){
        const ex=m.extracted,conf=m.confidence||{};
        const confBdg=function(c){return'<span class="conf2 '+(c==='high'?'high':c==='medium'?'med':'low')+'">'+(c||'?')+'</span>';};
        body+='<div class="ex-grid">';
        body+='<div class="ex-box"><div class="ex-lbl">Floor '+confBdg(conf.floor_dims)+'</div>';
        body+='<div class="ex-it"><span>Length</span><span class="ex-v '+(ex.floor&&ex.floor.length_m?'found':'missing')+'">'+(ex.floor&&ex.floor.length_m?ex.floor.length_m+'m':'Enter manually')+'</span></div>';
        body+='<div class="ex-it"><span>Width</span><span class="ex-v '+(ex.floor&&ex.floor.width_m?'found':'missing')+'">'+(ex.floor&&ex.floor.width_m?ex.floor.width_m+'m':'Enter manually')+'</span></div>';
        body+='</div>';
        body+='<div class="ex-box"><div class="ex-lbl">Walls '+confBdg(conf.wall_dims)+'</div>';
        body+='<div class="ex-it"><span>Walls</span><span class="ex-v '+(m.walls.length?'found':'missing')+'">'+(m.walls.length?m.walls.length+' extracted':'None found')+'</span></div>';
        body+='<div class="ex-it"><span>Openings</span><span class="ex-v '+(m.openings.length?'found':'assumed')+'">'+(m.openings.length?m.openings.length+' found':'None')+'</span></div>';
        body+='</div></div>';

        if(m.extractedSpec){
          const sp=m.extractedSpec;
          body+='<div class="ex-box" style="grid-column:1/-1"><div class="ex-lbl">What was extracted \u2713</div>';
          if(sp.houseType)body+='<div class="ex-it"><span>House type</span><span class="ex-v found">\u2713 '+sp.houseType+'</span></div>';
          if(sp.floorAreas&&sp.floorAreas.total_m2)body+='<div class="ex-it"><span>Floor areas</span><span class="ex-v found">\u2713 Grd: '+(sp.floorAreas.ground_m2||'?')+'m\u00b2 / 1st: '+(sp.floorAreas.first_m2||'?')+'m\u00b2</span></div>';
          if(sp.ceilingHeights&&sp.ceilingHeights.ground_floor_mm)body+='<div class="ex-it"><span>Ceiling heights</span><span class="ex-v found">\u2713 Grd: '+(sp.ceilingHeights.ground_floor_mm/1000).toFixed(3)+'m'+(sp.ceilingHeights.first_floor_mm?' / 1st: '+(sp.ceilingHeights.first_floor_mm/1000).toFixed(3)+'m':'')+'</span></div>';
          if(sp.wallSpec&&sp.wallSpec.type)body+='<div class="ex-it"><span>Wall spec</span><span class="ex-v found">\u2713 '+(sp.wallSpec.outer_leaf||'?')+(sp.wallSpec.cavity_mm?' / '+sp.wallSpec.cavity_mm+'mm cavity':'')+'</span></div>';
          if(sp.doorCount)body+='<div class="ex-it"><span>Door schedule</span><span class="ex-v found">\u2713 '+sp.doorCount+' doors</span></div>';
          if(sp.windowCount)body+='<div class="ex-it"><span>Window schedule</span><span class="ex-v found">\u2713 '+sp.windowCount+' windows</span></div>';
          body+='<div class="ex-it" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)"><span style="color:var(--g);font-weight:600">Needs manual entry</span><span class="ex-v assumed">\u270f Overall length &amp; width (Dimensions tab)</span></div>';
          body+='</div>';
        }
        if(ex.missing&&ex.missing.length>0){
          body+='<div class="ib red" style="margin-top:.5rem"><strong>Not extracted:</strong><ul style="margin:.4rem 0 0 1rem;padding:0">';
          ex.missing.forEach(function(msg){body+='<li style="font-size:10px;margin-bottom:3px">'+msg+'</li>';});
          body+='</ul></div>';
        }
        body+='<div class="ib" style="margin-top:.75rem;border-left-color:var(--g)"><strong>Next:</strong> Go to <strong>Dimensions tab</strong> and enter the overall building length and width.</div>';
        body+='<button class="bg" style="margin-top:.75rem" data-ctx='+ctx+' data-i="1" onclick="window.mxTabClick(this)">Go to Dimensions tab \u2192</button>';
      }
      body+='</div>';
    }
  }

  if(m.tab===1){
    if(m.aiState==='done')body+='<div class="ib green">Dimensions pre-filled from AI analysis. Check and correct anything below.</div>';
    body+='<div class="cd"><div class="ct">Floor plan</div><div class="g3">';
    body+='<div class="f"><label>Length (m)</label><input type="number" value="'+m.floor.L+'" step=".1" min=".5" data-ctx='+ctx+' data-field="floor" data-sub="L" onchange="window.mxInputChange(this)"/></div>';
    body+='<div class="f"><label>Width (m)</label><input type="number" value="'+m.floor.W+'" step=".1" min=".5" data-ctx='+ctx+' data-field="floor" data-sub="W" onchange="window.mxInputChange(this)"/></div>';
    body+='<div class="f"><label>Ceiling height (m)</label><input type="number" value="'+m.ceilingH+'" step=".05" min="2.1" data-ctx='+ctx+' data-field="ceilingH" onchange="window.mxInputChange(this)"/></div>';
    body+='</div></div>';

    body+='<div class="cd"><div class="ct">Walls</div>';
    body+='<div style="display:grid;grid-template-columns:1.2fr .8fr .8fr 80px 28px;gap:5px;padding:3px 0 5px;font-size:10px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.05em">';
    body+='<span>Label</span><span>Length</span><span>Height</span><span style="text-align:center">Ext?</span><span></span></div>';
    m.walls.forEach(function(w,i){
      body+='<div style="display:grid;grid-template-columns:1.2fr .8fr .8fr 80px 28px;gap:5px;align-items:center;margin-bottom:5px">';
      body+='<input value="'+w.label+'" style="font-size:11px;padding:5px 7px;border:1px solid var(--bd);border-radius:4px;background:rgba(255,255,255,.06);color:var(--w);font-family:\'DM Sans\',sans-serif" data-ctx='+ctx+' data-i='+i+' data-field="label" onchange="window.mxWallChange(this)"/>';
      body+='<input type="number" value="'+w.L+'" step=".1" style="font-size:11px;padding:5px 7px;border:1px solid var(--bd);border-radius:4px;background:rgba(255,255,255,.06);color:var(--w);font-family:\'DM Sans\',sans-serif;width:100%" data-ctx='+ctx+' data-i='+i+' data-field="L" onchange="window.mxWallChange(this)"/>';
      body+='<input type="number" value="'+w.H+'" step=".05" style="font-size:11px;padding:5px 7px;border:1px solid var(--bd);border-radius:4px;background:rgba(255,255,255,.06);color:var(--w);font-family:\'DM Sans\',sans-serif;width:100%" data-ctx='+ctx+' data-i='+i+' data-field="H" onchange="window.mxWallChange(this)"/>';
      body+='<div style="text-align:center"><input type="checkbox" '+(w.ext?'checked':'')+' data-ctx='+ctx+' data-i='+i+' data-field="ext" onchange="window.mxWallChange(this)" style="accent-color:var(--g);width:13px;height:13px"/></div>';
      body+='<button class="del-btn" data-ctx='+ctx+' data-i='+i+' onclick="window.mxDeleteWall(this)">X</button>';
      body+='</div>';
    });
    body+='<button class="add-btn" data-ctx='+ctx+' onclick="window.mxAddWall(this)">+ Add wall</button></div>';
  }

  if(m.tab===2){
    body+='<div class="cd"><div class="ct">Wall construction</div><div class="trow">';
    [['cavity','Cavity masonry'],['solid','Solid block'],['timber','Timber frame']].forEach(function(kl){
      body+='<div class="tog'+(m.wallType===kl[0]?' on':'')+'" data-ctx='+ctx+' data-val='+kl[0]+' onclick="window.mxSetWallType(this)">'+kl[1]+'</div>';
    });
    body+='</div><div class="tgl">Stud spacing</div><div class="trow">';
    [400,450,600].forEach(function(s){
      body+='<div class="tog'+(m.studSpacing===s?' on':'')+'" data-ctx='+ctx+' data-val='+s+' onclick="window.mxSetSpacing(this)">'+s+'mm</div>';
    });
    body+='</div></div>';

    body+='<div class="cd"><div class="ct">Floor</div><div class="trow">';
    [['concrete','Concrete slab'],['timber','Timber suspended']].forEach(function(kl){
      body+='<div class="tog'+(m.floorType===kl[0]?' on':'')+'" data-ctx='+ctx+' data-val='+kl[0]+' onclick="window.mxSetFloorType(this)">'+kl[1]+'</div>';
    });
    body+='</div></div>';

    body+='<div class="cd"><div class="ct">Roof</div><div class="trow">';
    [['flat','Flat (EPDM)'],['pitched','Pitched (tiled)']].forEach(function(kl){
      body+='<div class="tog'+(m.roofType===kl[0]?' on':'')+'" data-ctx='+ctx+' data-val='+kl[0]+' onclick="window.mxSetRoofType(this)">'+kl[1]+'</div>';
    });
    body+='</div><div class="g4" style="margin-top:.5rem">';
    body+='<div class="f"><label>Span (m)</label><input type="number" value="'+m.roof.span+'" step=".1" data-ctx='+ctx+' data-field="roof" data-sub="span" onchange="window.mxInputChange(this)"/></div>';
    body+='<div class="f"><label>Length (m)</label><input type="number" value="'+m.roof.length+'" step=".1" data-ctx='+ctx+' data-field="roof" data-sub="length" onchange="window.mxInputChange(this)"/></div>';
    body+='<div class="f"><label>Overhang (m)</label><input type="number" value="'+m.roof.overhang+'" step=".05" data-ctx='+ctx+' data-field="roof" data-sub="overhang" onchange="window.mxInputChange(this)"/></div>';
    if(m.roofType==='pitched')body+='<div class="f"><label>Pitch (deg)</label><input type="number" value="'+m.roof.pitch+'" step="1" min="10" max="60" data-ctx='+ctx+' data-field="roof" data-sub="pitch" onchange="window.mxInputChange(this)"/></div>';
    body+='</div></div>';

    body+='<div class="cd"><div class="ct">Linings</div>';
    body+='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:#ccc">';
    body+='<input type="checkbox" '+(m.plaster?'checked':'')+' data-ctx='+ctx+' data-field="plaster" onchange="window.mxInputChange(this)" style="accent-color:var(--g);width:13px;height:13px"/>';
    body+=' Include plasterboard, skim and adhesive</label></div>';
  }

  if(m.tab===3){
    body+='<div class="ib">Openings deducted from ext wall brickwork. Lintels added automatically.</div>';
    body+='<div class="cd"><div class="ct">Add opening</div><div class="g4" style="margin-bottom:.6rem">';
    body+='<div class="f"><label>Label</label><input id="mxiOL_'+ctx+'" value="Bifolding doors"/></div>';
    body+='<div class="f"><label>Width (m)</label><input id="mxiOW_'+ctx+'" type="number" step=".05" value="2.4"/></div>';
    body+='<div class="f"><label>Height (m)</label><input id="mxiOH_'+ctx+'" type="number" step=".05" value="2.1"/></div>';
    body+='<div class="f"><label>Qty</label><input id="mxiOQ_'+ctx+'" type="number" value="1" min="1"/></div>';
    body+='</div><button class="add-btn" data-ctx='+ctx+' onclick="window.mxAddOpening(this)">+ Add opening</button></div>';

    if(m.openings.length){
      body+='<div class="cd"><div class="ct">Openings \u2014 '+mxiOA(m).toFixed(2)+'m\u00b2 total deduction</div>';
      body+='<table class="mtbl2"><thead><tr><th>Opening</th><th>W</th><th>H</th><th>Qty</th><th>Area</th><th></th></tr></thead><tbody>';
      m.openings.forEach(function(o,i){
        body+='<tr><td>'+o.label+'</td><td>'+mxFN(o.W).toFixed(2)+'m</td><td>'+mxFN(o.H).toFixed(2)+'m</td>';
        body+='<td>'+o.qty+'</td><td>'+(mxFN(o.W)*mxFN(o.H)*o.qty).toFixed(2)+'m\u00b2</td>';
        body+='<td><button class="del-btn" data-ctx='+ctx+' data-i='+i+' onclick="window.mxDeleteOpening(this)">X</button></td></tr>';
      });
      body+='</tbody></table></div>';
    }
  }

  if(m.tab===4){
    const mats=mxiCalc(m);
    const cats=[];
    mats.forEach(function(x){if(cats.indexOf(x.cat)<0)cats.push(x.cat);});
    body+='<div class="ib">All quantities include +10% wastage. Verify against drawings before ordering.</div>';
    body+='<div class="cd" style="padding:0;overflow:hidden"><table class="mtbl2"><thead><tr>';
    body+='<th style="min-width:170px">Material</th><th>Unit</th><th>Qty +10%</th><th style="text-align:left">Note</th>';
    body+='</tr></thead><tbody>';
    cats.forEach(function(cat){
      body+='<tr class="mcat"><td colspan="4">'+cat+'</td></tr>';
      mats.filter(function(x){return x.cat===cat;}).forEach(function(x){
        body+='<tr><td style="font-size:10px">'+x.item+'</td><td style="color:var(--mu)">'+x.unit+'</td>';
        body+='<td><span class="qty-badge">'+(typeof x.qty==='number'?x.qty.toLocaleString():x.qty)+'</span></td>';
        body+='<td style="text-align:left;font-size:10px;color:var(--mu)">'+x.note+'</td></tr>';
      });
    });
    body+='</tbody></table></div>';
    body+=renderMerchantPanel(ctx,mats,{name:m.proj,client:m.client},m.drawingImages);
    body+='<div style="display:flex;gap:6px;margin-top:.75rem">';
    body+='<button class="bg" data-ctx='+ctx+' onclick="window.mxPDF(this)">Materials PDF</button>';
    body+='<button class="bg" data-ctx='+ctx+' onclick="window.mxCSV(this)">CSV Merchant List</button>';
    body+='</div>';
  }

  // ── TAB 5: KITCHEN & BATHROOM ───────────────────────────────────────────
  if(m.tab===5){
    body+='<div class="cd"><div class="ct">Kitchen & Bathroom Designer</div>';
    body+='<div class="ib blue">AI reads your floor plan drawings and suggests fitted layouts with a visual plan and full component schedule.</div>';
    
    // Room list from extraction
    var rooms=m.rooms||[];
    var kitchens=rooms.filter(function(r){return /kitchen|kit/i.test(r.name||'');});
    var bathrooms=rooms.filter(function(r){return /bath|ensuite|shower|wc|toilet/i.test(r.name||'');});
    
    if(m.kbAiState==='idle'||m.kbAiState==='error'){
      if(m.uploadedFiles.length===0){
        body+='<div class="ib">Upload your drawings in the Upload Drawings tab first, then come back here.</div>';
      } else {
        body+='<button class="bg" style="background:var(--bl);color:#fff;width:100%;padding:.85rem" data-ctx='+ctx+' onclick="window.mxKBDesign(this)">Design Kitchen & Bathrooms from Drawings</button>';
      }
    }
    
    if(m.kbAiState==='processing'){
      body+='<div class="ai-panel"><div class="ai-title"><div class="ai-spinner"></div> Designing layouts...</div>';
      body+='<div class="ai-log">';
      (m.kbAiLog||[]).forEach(function(l){body+='<div class="astep '+l.type+'">'+l.msg+'</div>';});
      body+='</div></div>';
    }
    
    if(m.kbAiState==='done'&&m.kitchenDesign){
      var kd=m.kitchenDesign;
      
      // Kitchen layout
      body+='<div class="cd" style="margin-top:.75rem">';
      body+='<div class="ct">Kitchen — '+( kd.layout_type||'Fitted')+'</div>';
      body+='<div class="ib green" style="margin-bottom:.75rem">Room: '+(kd.room_dims||'See plan')+' &nbsp;|&nbsp; Layout: '+(kd.layout_type||'')+' &nbsp;|&nbsp; Run: '+(kd.total_run_m||'?')+'m</div>';
      
      // SVG floor plan
      if(kd.svg){
        body+='<div style="background:#1a1a18;border-radius:8px;padding:1rem;margin-bottom:.75rem;overflow:auto">';
        body+=kd.svg;
        body+='</div>';
      }
      
      // Component schedule
      if(kd.components&&kd.components.length>0){
        body+='<table class="mtbl2"><thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Note</th></tr></thead><tbody>';
        kd.components.forEach(function(c){
          body+='<tr><td>'+c.item+'</td><td>'+(c.size||'-')+'</td><td>'+c.qty+'</td><td style="font-size:10px;color:var(--mu)">'+(c.note||'')+'</td></tr>';
        });
        body+='</tbody></table>';
      }
      body+='</div>';
      
      // Bathroom designs
      (m.bathroomDesigns||[]).forEach(function(bd){
        body+='<div class="cd" style="margin-top:.75rem">';
        body+='<div class="ct">'+bd.room_name+' — '+(bd.layout_type||'Standard')+' layout</div>';
        if(bd.svg){
          body+='<div style="background:#1a1a18;border-radius:8px;padding:1rem;margin-bottom:.75rem;overflow:auto">';
          body+=bd.svg;
          body+='</div>';
        }
        if(bd.components&&bd.components.length>0){
          body+='<table class="mtbl2"><thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Note</th></tr></thead><tbody>';
          bd.components.forEach(function(c){
            body+='<tr><td>'+c.item+'</td><td>'+(c.size||'-')+'</td><td>'+c.qty+'</td><td style="font-size:10px;color:var(--mu)">'+(c.note||'')+'</td></tr>';
          });
          body+='</tbody></table>';
        }
        body+='</div>';
      });
      
      body+='<button class="bg" style="margin-top:.75rem" data-ctx='+ctx+' onclick="window.mxKBDesign(this)">Redesign</button>';
    }
    
    body+='</div>';
  }

  return stabs+body;
}
