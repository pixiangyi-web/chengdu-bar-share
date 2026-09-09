const json=(data,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});

export async function onRequestGet({env}){
  const {results}=await env.DB.prepare(`SELECT n.id,n.bar_name,n.area,n.bar_type,n.source_url,n.reason,n.status,n.created_at,COALESCE(f.review_count,0) review_count FROM bar_nominations n LEFT JOIN (SELECT lower(trim(bar_id)) bar_key,COUNT(*) review_count FROM community_feedback GROUP BY lower(trim(bar_id))) f ON lower(trim(n.bar_name))=f.bar_key WHERE n.status IN ('pending','reviewing','accepted') AND COALESCE(f.review_count,0)<5 ORDER BY n.created_at DESC,n.id DESC`).all();
  const grouped=new Map();
  for(const row of results){
    const key=String(row.bar_name||'').trim().toLowerCase();
    const current=grouped.get(key);
    if(!current){grouped.set(key,{...row,reason:row.reason?[row.reason]:[],review_count:Number(row.review_count)||0});continue}
    if(row.reason&&!current.reason.includes(row.reason))current.reason.push(row.reason);
    if(!current.source_url&&row.source_url)current.source_url=row.source_url;
    if(!current.area&&row.area)current.area=row.area;
    if(!current.bar_type&&row.bar_type)current.bar_type=row.bar_type;
    current.created_at=current.created_at>row.created_at?current.created_at:row.created_at;
  }
  return json({list:[...grouped.values()].map(item=>({...item,reason:item.reason.join('；')}))});
}

export async function onRequestPost({request,env}){
  let body;try{body=await request.json()}catch{return json({error:"提交内容无法读取"},400)}
  if(body.website)return json({ok:true});
  const clean=(key,max)=>String(body[key]||"").trim().slice(0,max);
  const barName=clean("bar_name",80),area=clean("area",80),barType=clean("bar_type",50),sourceUrl=clean("source_url",500),reason=clean("reason",500),device=clean("device_hash",64);
  const source=body.source === "mini_program" ? "mini_program" : "web";
  if(!barName||!area||reason.length<5||!/^[a-f0-9]{64}$/.test(device))return json({error:"请完整填写酒吧名称、区域和推荐理由"},400);
  if(sourceUrl){try{const url=new URL(sourceUrl);if(!/^https?:$/.test(url.protocol))throw new Error()}catch{return json({error:"店铺链接格式不正确"},400)}}
  await env.DB.prepare(`INSERT INTO bar_nominations (bar_name,area,bar_type,source_url,reason,device_hash,source) VALUES (?,?,?,?,?,?,?) ON CONFLICT(bar_name,device_hash) DO UPDATE SET area=excluded.area,bar_type=excluded.bar_type,source_url=excluded.source_url,reason=excluded.reason,source=excluded.source,status='pending',created_at=CURRENT_TIMESTAMP`).bind(barName,area,barType||null,sourceUrl||null,reason,device,source).run();
  return json({ok:true});
}
