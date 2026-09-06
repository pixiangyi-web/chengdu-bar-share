const scoreFields=["classic_score","special_score","environment_score","service_score","value_score"];
const json=(data,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});

async function getOpenid(request,env){
  const value=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  const [payload,signature]=String(value||"").split(".");
  const secret=env.SESSION_SECRET||env.WECHAT_APPSECRET;
  if(!payload||!signature||!secret)return null;
  try{
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    const bytes=Uint8Array.from(atob(signature.replace(/-/g,"+").replace(/_/g,"/")+"=="),char=>char.charCodeAt(0));
    const valid=await crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(payload));
    const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g,"+").replace(/_/g,"/")+"=="),char=>char.charCodeAt(0))));
    return valid&&data.exp>Math.floor(Date.now()/1000)?data.openid:null;
  }catch{return null}
}

export async function onRequestGet({request,env}){
  const barId=new URL(request.url).searchParams.get("bar_id")?.trim();
  if(!barId){
    const rows=await env.DB.prepare(`SELECT bar_id,COUNT(*) count,ROUND(AVG(classic_score),1) classic,ROUND(AVG(special_score),1) special,ROUND(AVG(environment_score),1) environment,ROUND(AVG(service_score),1) service,ROUND(AVG(value_score),1) value,SUM(rank_opinion='high') high,SUM(rank_opinion='fair') fair,SUM(rank_opinion='low') low,MAX(updated_at) updated_at FROM community_feedback GROUP BY bar_id ORDER BY ROUND((AVG(classic_score)+AVG(special_score)+AVG(environment_score)+AVG(service_score)+AVG(value_score))/5.0,1) DESC, count DESC, updated_at DESC`).all();
    return json({list:rows.results});
  }
  const row=await env.DB.prepare(`SELECT COUNT(*) count,ROUND(AVG(classic_score),1) classic,ROUND(AVG(special_score),1) special,ROUND(AVG(environment_score),1) environment,ROUND(AVG(service_score),1) service,ROUND(AVG(value_score),1) value,SUM(rank_opinion='high') high,SUM(rank_opinion='fair') fair,SUM(rank_opinion='low') low FROM community_feedback WHERE bar_id=?`).bind(barId).first();
  const reviews=await env.DB.prepare(`SELECT id,classic_score,special_score,environment_score,service_score,value_score,rank_opinion,source,created_at,updated_at FROM community_feedback WHERE bar_id=? ORDER BY updated_at DESC, id DESC`).bind(barId).all();
  return json({
    count:row.count,
    averages:{classic:row.classic,special:row.special,environment:row.environment,service:row.service,value:row.value},
    opinions:{high:row.high,fair:row.fair,low:row.low},
    reviews:reviews.results
  });
}

export async function onRequestPost({request,env}){
  let body;try{body=await request.json()}catch{return json({error:"invalid json"},400)}
  const barId=String(body.bar_id||"").trim(),device=String(body.device_hash||""),openid=await getOpenid(request,env),source=body.source === "mini_program" ? "mini_program" : "web";
  if(!barId||barId.length>120||(!openid&&!/^[a-f0-9]{64}$/.test(device)))return json({error:"invalid identity"},400);
  if(scoreFields.some(field=>!Number.isInteger(body[field])||body[field]<1||body[field]>5)||!["high","fair","low"].includes(body.rank_opinion))return json({error:"invalid rating"},400);
  const existing = openid
    ? await env.DB.prepare("SELECT id FROM community_feedback WHERE bar_id=? AND openid=?").bind(barId,openid).first()
    : await env.DB.prepare("SELECT id FROM community_feedback WHERE bar_id=? AND device_hash=?").bind(barId,device).first();
  if(existing){
    await env.DB.prepare("UPDATE community_feedback SET openid=COALESCE(?,openid),classic_score=?,special_score=?,environment_score=?,service_score=?,value_score=?,rank_opinion=?,source=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(openid,...scoreFields.map(field=>body[field]),body.rank_opinion,source,existing.id).run();
  }else{
    await env.DB.prepare("INSERT INTO community_feedback (bar_id,device_hash,openid,classic_score,special_score,environment_score,service_score,value_score,rank_opinion,source) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(barId,device,openid,...scoreFields.map(field=>body[field]),body.rank_opinion,source).run();
  }
  return json({ok:true});
}
