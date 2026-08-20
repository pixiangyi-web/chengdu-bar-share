const bars=window.BAR_DATA||[];
const state={sort:'total',direction:'desc',expanded:false,query:'',selectedArea:null};
const scoreLabels={total:'总得分',professional:'专业分',dianping:'大众点评分',xhs:'小红书分',local:'本地分',travel:'旅游/英文分',average:'人均'};
const body=document.getElementById('ranking-body');
const mobile=document.getElementById('mobile-ranking');
const expandButton=document.getElementById('expand-button');
const searchInput=document.getElementById('search-input');
const sortSelect=document.getElementById('sort-select');
const descButton=document.getElementById('sort-desc');
const ascButton=document.getElementById('sort-asc');
const methodDialog=document.getElementById('method-dialog');
const ratingDialog=document.getElementById('rating-dialog');
const ratingState={bar:null,scores:{},opinion:null};
const ratingDimensions=[['classic','经典'],['special','特调'],['environment','环境'],['service','服务'],['value','性价比']];

function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function valueFor(bar,key){return key==='average'?bar.average:bar.scores[key]}
function formatScore(value){return value==null?'—':Number(value).toFixed(1).replace(/\.0$/,'')}
function formatMoney(value){return value==null?'—':`¥${Math.round(value)}`}
function tagsHtml(features,limit=7){return `<div class="feature-list">${features.slice(0,limit).map(tag=>`<span class="feature-tag ${/烟/.test(tag)?'smoke':''}">${esc(tag)}</span>`).join('')}</div>`}
function sortedBars(){
  const query=state.query.trim().toLowerCase();
  const filtered=query?bars.filter(bar=>[bar.name,bar.type,bar.area,...bar.features].join(' ').toLowerCase().includes(query)):bars.slice();
  return filtered.sort((a,b)=>{const av=valueFor(a,state.sort),bv=valueFor(b,state.sort);if(av==null&&bv==null)return a.rank-b.rank;if(av==null)return 1;if(bv==null)return-1;const delta=av-bv;return state.direction==='asc'?delta||a.rank-b.rank:-delta||a.rank-b.rank});
}
function rateButton(bar){return `<button class="rate-button" type="button" data-rate="${bar.rank}"><i data-lucide="star"></i>站内评分</button>`}
function tableRow(bar){const scores=['total','professional','dianping','xhs','local','travel'].map((key,index)=>`<td class="${index===0?'score-total':''} ${bar.scores[key]==null?'muted-score':''}">${formatScore(bar.scores[key])}</td>`).join('');return `<tr><td class="rank-col"><span class="rank-number">${bar.rank}</span></td><td><div class="bar-name">${esc(bar.name)}</div>${rateButton(bar)}</td>${scores}<td class="money">${formatMoney(bar.average)}</td><td class="location">${esc(bar.area)}</td><td class="bar-type">${esc(bar.type)}</td><td>${tagsHtml(bar.features)}</td><td>${bar.dianpingUrl?`<a class="dp-link" href="${esc(bar.dianpingUrl)}" target="_blank" rel="noopener" aria-label="打开${esc(bar.name)}的大众点评"><i data-lucide="external-link"></i></a>`:'<span class="no-link">—</span>'}</td></tr>`}
function mobileCard(bar){return `<article class="mobile-card"><div class="mobile-card-head"><span class="mobile-rank">${bar.rank}</span><h3>${esc(bar.name)}</h3><b class="mobile-total">${formatScore(bar.scores.total)}</b></div><div class="mobile-meta"><span>${formatMoney(bar.average)}</span><span>${esc(bar.type)}</span><span>${esc(bar.area)}</span>${bar.dianpingUrl?`<a href="${esc(bar.dianpingUrl)}" target="_blank" rel="noopener">大众点评 ↗</a>`:''}</div><div class="mobile-scores">${['professional','dianping','xhs','local','travel'].map(key=>`<span>${formatScore(bar.scores[key])}<small>${scoreLabels[key].replace('分','')}</small></span>`).join('')}</div>${tagsHtml(bar.features,5)}${rateButton(bar)}</article>`}
function renderRanking(){
  const all=sortedBars();const searching=Boolean(state.query.trim());const shown=(state.expanded||searching)?all:all.slice(0,50);
  body.innerHTML=shown.map(tableRow).join('');mobile.innerHTML=shown.map(mobileCard).join('');
  document.getElementById('empty-state').hidden=shown.length>0;
  expandButton.hidden=searching||all.length<=50;
  expandButton.innerHTML=state.expanded?'<i data-lucide="chevron-up"></i><span>收起，仅显示前 50 条</span>':`<i data-lucide="chevron-down"></i><span>展开第 51–${all.length} 条</span>`;
  document.getElementById('ranking-status').textContent=`按${scoreLabels[state.sort]}${state.direction==='desc'?'从高到低':'从低到高'} · 显示 ${shown.length}/${all.length}`;
  sortSelect.value=state.sort;descButton.classList.toggle('is-active',state.direction==='desc');ascButton.classList.toggle('is-active',state.direction==='asc');descButton.setAttribute('aria-pressed',state.direction==='desc');ascButton.setAttribute('aria-pressed',state.direction==='asc');
  lucide.createIcons({attrs:{'stroke-width':1.8}});
}
function setSort(key,direction){if(state.sort===key&&!direction)state.direction=state.direction==='desc'?'asc':'desc';else{state.sort=key;state.direction=direction||'desc'}renderRanking()}
expandButton.addEventListener('click',()=>{state.expanded=!state.expanded;renderRanking()});
searchInput.addEventListener('input',event=>{state.query=event.target.value;renderRanking()});
sortSelect.addEventListener('change',event=>setSort(event.target.value,state.direction));
descButton.addEventListener('click',()=>setSort(state.sort,'desc'));ascButton.addEventListener('click',()=>setSort(state.sort,'asc'));
document.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>setSort(button.dataset.sort)));
document.getElementById('method-button').addEventListener('click',()=>methodDialog.showModal());
document.getElementById('method-close').addEventListener('click',()=>methodDialog.close());
methodDialog.addEventListener('click',event=>{if(event.target===methodDialog)methodDialog.close()});

async function deviceHash(){
  let id=localStorage.getItem('chengdu-bar-device');
  if(!id){id=crypto.randomUUID();localStorage.setItem('chengdu-bar-device',id)}
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
  return[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function renderRatingRows(){
  document.querySelector('.rating-grid').innerHTML=ratingDimensions.map(([key,label])=>`<div class="rating-row"><span>${label}</span><div class="stars" role="radiogroup" aria-label="${label}评分">${[1,2,3,4,5].map(value=>`<button type="button" data-score="${key}" data-value="${value}" role="radio" aria-checked="false" aria-label="${label}${value}分"><i data-lucide="star"></i></button>`).join('')}</div><b id="score-${key}">未评分</b></div>`).join('');
}
function updateRatingControls(){
  ratingDimensions.forEach(([key])=>{
    const current=ratingState.scores[key]||0;
    document.querySelectorAll(`[data-score="${key}"]`).forEach(button=>{const active=Number(button.dataset.value)<=current;button.classList.toggle('is-active',active);button.setAttribute('aria-checked',Number(button.dataset.value)===current)});
    document.getElementById(`score-${key}`).textContent=current?`${current} 分`:'未评分';
  });
  document.getElementById('rating-next').disabled=ratingDimensions.some(([key])=>!ratingState.scores[key]);
  document.querySelectorAll('[data-opinion]').forEach(button=>{const active=button.dataset.opinion===ratingState.opinion;button.classList.toggle('is-active',active);button.setAttribute('aria-checked',active)});
  document.getElementById('rating-submit').disabled=!ratingState.opinion;
}
async function loadRatingSummary(bar){
  const box=document.getElementById('rating-summary');box.hidden=true;
  try{const response=await fetch(`/api/feedback?bar_id=${encodeURIComponent(bar.name)}`);if(!response.ok)return;const data=await response.json();if(!data.count)return;box.innerHTML=`<b>${data.count} 人已评分</b><span>经典 ${data.averages.classic} · 特调 ${data.averages.special} · 环境 ${data.averages.environment} · 服务 ${data.averages.service} · 性价比 ${data.averages.value}</span>`;box.hidden=false}catch{}
}
function openRating(bar){
  ratingState.bar=bar;ratingState.scores={};ratingState.opinion=null;
  document.getElementById('rating-bar-name').textContent=`#${bar.rank} · ${bar.name}`;
  document.getElementById('rating-rank-context').textContent=`研究总榜当前排名：第 ${bar.rank} 名`;
  document.getElementById('rating-message').textContent='';
  document.getElementById('rating-scores').hidden=false;document.getElementById('rating-opinion').hidden=true;
  renderRatingRows();updateRatingControls();loadRatingSummary(bar);ratingDialog.showModal();lucide.createIcons({attrs:{'stroke-width':1.8}});
}
document.addEventListener('click',event=>{const rate=event.target.closest('[data-rate]');if(rate)openRating(bars.find(bar=>bar.rank===Number(rate.dataset.rate)));const score=event.target.closest('[data-score]');if(score){ratingState.scores[score.dataset.score]=Number(score.dataset.value);updateRatingControls()}});
document.getElementById('rating-next').addEventListener('click',()=>{document.getElementById('rating-scores').hidden=true;document.getElementById('rating-opinion').hidden=false;lucide.createIcons({attrs:{'stroke-width':1.8}})});
document.getElementById('rating-back').addEventListener('click',()=>{document.getElementById('rating-opinion').hidden=true;document.getElementById('rating-scores').hidden=false});
document.querySelectorAll('[data-opinion]').forEach(button=>button.addEventListener('click',()=>{ratingState.opinion=button.dataset.opinion;updateRatingControls()}));
document.getElementById('rating-close').addEventListener('click',()=>ratingDialog.close());
ratingDialog.addEventListener('click',event=>{if(event.target===ratingDialog)ratingDialog.close()});
document.getElementById('rating-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=document.getElementById('rating-submit'),message=document.getElementById('rating-message');submit.disabled=true;message.textContent='正在提交…';
  try{const response=await fetch('/api/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bar_id:ratingState.bar.name,device_hash:await deviceHash(),...Object.fromEntries(ratingDimensions.map(([key])=>[`${key}_score`,ratingState.scores[key]])),rank_opinion:ratingState.opinion})});if(!response.ok)throw new Error();message.textContent='评分已记录，感谢你的判断。';setTimeout(()=>ratingDialog.close(),900)}catch{message.textContent='提交失败，请稍后重试。';submit.disabled=false}
});

document.getElementById('bar-count').textContent=bars.length;document.getElementById('link-count').textContent=bars.filter(bar=>bar.dianpingUrl).length;document.getElementById('area-count').textContent=new Set(bars.map(bar=>bar.areaKey)).size;
renderRanking();

const mappedBars=bars.filter(bar=>bar.lat!=null&&bar.lon!=null);
function wgsToGcj(lat,lon){
  if(lon<72.004||lon>137.8347||lat<.8293||lat>55.8271)return[lat,lon];
  const rad=Math.PI/180,a=6378245,ee=.006693421622965943,x=lon-105,y=lat-35;
  let dLat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
  let dLon=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
  dLat+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3+(20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3+(160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;
  dLon+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3+(20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3+(150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;
  const rLat=lat*rad,magic=1-ee*Math.sin(rLat)**2,sqrt=Math.sqrt(magic);
  return[lat+dLat*180/((a*(1-ee))/(magic*sqrt)*Math.PI),lon+dLon*180/(a/sqrt*Math.cos(rLat)*Math.PI)];
}
const mapBars=mappedBars.map(bar=>{const[mapLat,mapLon]=wgsToGcj(bar.lat,bar.lon);return{...bar,mapLat,mapLon}});
const groups=[...mapBars.reduce((map,bar)=>{const group=map.get(bar.areaKey)||{name:bar.areaKey,bars:[],lat:0,lon:0};group.bars.push(bar);group.lat+=bar.mapLat;group.lon+=bar.mapLon;map.set(bar.areaKey,group);return map},new Map()).values()].map(group=>({...group,lat:group.lat/group.bars.length,lon:group.lon/group.bars.length})).sort((a,b)=>b.bars.length-a.bars.length);
const map=L.map('map',{zoomControl:true,preferCanvas:true,zoomSnap:.25});
L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',{subdomains:'1234',maxZoom:19,attribution:'© 高德地图'}).addTo(map);
map.fitBounds(L.latLngBounds(mapBars.map(bar=>[bar.mapLat,bar.mapLon])),{padding:[18,18]});
const heat=L.heatLayer(mapBars.map(bar=>[bar.mapLat,bar.mapLon,1]),{radius:42,blur:25,minOpacity:.25,maxZoom:14,gradient:{.12:'#27b99a',.4:'#f4d35e',.68:'#ff8a48',1:'#e83338'}}).addTo(map);
const areaLayer=L.layerGroup().addTo(map);const markerLayer=L.layerGroup().addTo(map);
groups.forEach(group=>{const size=Math.min(48,24+Math.sqrt(group.bars.length)*6);const icon=L.divIcon({className:'area-bubble',html:String(group.bars.length),iconSize:[size,size],iconAnchor:[size/2,size/2]});L.marker([group.lat,group.lon],{icon}).bindTooltip(`${group.name} · ${group.bars.length}家`).on('click',()=>selectArea(group.name,true)).addTo(areaLayer)});
mapBars.forEach(bar=>L.circleMarker([bar.mapLat,bar.mapLon],{radius:5,color:'#fffaf1',weight:2,fillColor:'#1c1814',fillOpacity:.9}).bindTooltip(`${bar.rank}. ${bar.name}`).on('click',()=>selectArea(bar.areaKey,false)).addTo(markerLayer));
function updateMapLayers(){const zoom=map.getZoom(),detailed=zoom>=13.5,overview=zoom<12.25;overview||detailed?map.removeLayer(areaLayer):areaLayer.addTo(map);detailed?markerLayer.addTo(map):map.removeLayer(markerLayer);heat.setOptions({radius:detailed?30:42,blur:detailed?18:25})}
function districtItem(bar){const link=bar.dianpingUrl?`<a class="district-dp-link" href="${esc(bar.dianpingUrl)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>大众点评</a>`:'<span class="district-no-link">暂无点评链接</span>';return `<article class="district-item"><div class="district-item-head"><h4>${esc(bar.name)}</h4><span class="district-rank">#${bar.rank} · ${formatScore(bar.scores.total)}</span></div><div class="district-meta"><span>${esc(bar.type)}</span><span>${formatMoney(bar.average)}/人</span>${link}</div>${tagsHtml(bar.features,4)}${rateButton(bar)}</article>`}
function selectArea(name,zoom){const group=groups.find(item=>item.name===name);if(!group)return;state.selectedArea=name;document.getElementById('district-name').textContent=name;document.getElementById('district-count').textContent=`${group.bars.length} 家`;document.getElementById('district-list').innerHTML=group.bars.sort((a,b)=>a.rank-b.rank).map(districtItem).join('');lucide.createIcons({attrs:{'stroke-width':1.8}});if(zoom){map.flyTo([group.lat,group.lon],Math.max(14,map.getZoom()),{duration:.65})}}
function nearestArea(){if(map.getZoom()<13.5)return;const center=map.getCenter();let nearest=null,distance=Infinity;groups.forEach(group=>{const d=center.distanceTo([group.lat,group.lon]);if(d<distance){distance=d;nearest=group}});if(nearest&&distance<6500)selectArea(nearest.name,false)}
map.on('zoomend',()=>{updateMapLayers();nearestArea()});map.on('moveend',nearestArea);updateMapLayers();selectArea(groups[0].name,false);
lucide.createIcons({attrs:{'stroke-width':1.8}});
