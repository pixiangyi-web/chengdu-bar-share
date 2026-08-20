const json=(data,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});

export async function onRequestGet({env}){
  const {results}=await env.DB.prepare("SELECT bar_name,suggested_tags FROM bar_tag_suggestions WHERE status='accepted' ORDER BY reviewed_at,created_at").all();
  const grouped={};
  for(const row of results){
    let tags=[];try{tags=JSON.parse(row.suggested_tags)}catch{}
    grouped[row.bar_name]=[...new Set([...(grouped[row.bar_name]||[]),...tags])];
  }
  return json({tags:grouped});
}

export async function onRequestPost({request,env}){
  let body;try{body=await request.json()}catch{return json({error:"提交内容无法读取"},400)}
  if(body.website)return json({ok:true});
  const barName=String(body.bar_name||"").trim().slice(0,80),note=String(body.note||"").trim().slice(0,500),device=String(body.device_hash||"").trim().slice(0,64);
  const tags=[...new Set((Array.isArray(body.tags)?body.tags:[]).map(tag=>String(tag).trim().slice(0,24)).filter(Boolean))].slice(0,5);
  if(!barName||!tags.length||note.length<5||!/^[a-f0-9]{64}$/.test(device))return json({error:"请选择标签并简要说明依据"},400);
  await env.DB.prepare(`INSERT INTO bar_tag_suggestions (bar_name,suggested_tags,note,device_hash) VALUES (?,?,?,?) ON CONFLICT(bar_name,device_hash) DO UPDATE SET suggested_tags=excluded.suggested_tags,note=excluded.note,status='pending',reviewed_at=NULL,created_at=CURRENT_TIMESTAMP`).bind(barName,JSON.stringify(tags),note,device).run();
  return json({ok:true});
}
