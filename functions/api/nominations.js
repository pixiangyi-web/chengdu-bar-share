const json=(data,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});

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
