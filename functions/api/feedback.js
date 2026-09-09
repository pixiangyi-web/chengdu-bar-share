import { requireMembership } from "../../lib/payment.js";
const scoreFields=["classic_score","special_score","environment_score","service_score","value_score"];
const json=(data,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});
function base64urlBytes(value){
  const normalized=String(value).replace(/-/g,"+").replace(/_/g,"/");
  const padding="=".repeat((4-normalized.length%4)%4);
  return Uint8Array.from(atob(normalized+padding),char=>char.charCodeAt(0));
}
async function ensureFeedbackTextColumns(env){
  for(const sql of ["ALTER TABLE community_feedback ADD COLUMN note TEXT NOT NULL DEFAULT ''","ALTER TABLE community_feedback ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"]){try{await env.DB.prepare(sql).run()}catch{}}
}

async function getOpenid(request,env){
  const value=request.headers.get("x-session-token")||request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  const [payload,signature]=String(value||"").split(".");
  const secret=env.SESSION_SECRET||env.WECHAT_APPSECRET;
  if(!payload||!signature||!secret)return null;
  try{
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    const bytes=base64urlBytes(signature);
    const valid=await crypto.subtle.verify("HMAC",key,bytes,new TextEncoder().encode(payload));
    const data=JSON.parse(new TextDecoder().decode(base64urlBytes(payload)));
    return valid&&data.exp>Math.floor(Date.now()/1000)?data.openid:null;
  }catch{return null}
}

async function bindDeviceFeedback(request,env,openid){
  const device=String(request.headers.get("x-device-hash")||"");
  if(!openid||!/^[a-f0-9]{64}$/.test(device))return;
  await env.DB.prepare("UPDATE community_feedback SET openid=? WHERE device_hash=? AND (openid IS NULL OR openid='')").bind(openid,device).run();
}

export async function onRequestGet({request,env}){
  await ensureFeedbackTextColumns(env);
  const barId=new URL(request.url).searchParams.get("bar_id")?.trim();
  if(!barId){
    // Keep suspicious Reply submissions for audit, but exclude them from the
    // public leaderboard: Reply-only devices plus the identical 5/5/5/5/5-low
    // batch are treated as test/noise records.
    const rows=await env.DB.prepare(`SELECT f.bar_id,f.count,f.classic,f.special,f.environment,f.service,f.value,f.high,f.fair,f.low,f.updated_at,n.bar_name nomination_name,n.area nomination_area,n.bar_type nomination_type FROM (SELECT bar_id,COUNT(*) count,ROUND(AVG(classic_score),1) classic,ROUND(AVG(special_score),1) special,ROUND(AVG(environment_score),1) environment,ROUND(AVG(service_score),1) service,ROUND(AVG(value_score),1) value,SUM(rank_opinion='high') high,SUM(rank_opinion='fair') fair,SUM(rank_opinion='low') low,MAX(updated_at) updated_at FROM community_feedback f WHERE NOT (f.bar_id='Reply' AND (NOT EXISTS (SELECT 1 FROM community_feedback other WHERE other.device_hash=f.device_hash AND other.bar_id<>'Reply') OR (f.classic_score=5 AND f.special_score=5 AND f.environment_score=5 AND f.service_score=5 AND f.value_score=5 AND f.rank_opinion='low'))) GROUP BY bar_id) f LEFT JOIN (SELECT lower(trim(bar_name)) bar_key,MAX(bar_name) bar_name,MAX(area) area,MAX(bar_type) bar_type FROM bar_nominations WHERE status IN ('pending','reviewing','accepted') GROUP BY lower(trim(bar_name))) n ON lower(trim(f.bar_id))=n.bar_key ORDER BY ROUND((f.classic+f.special+f.environment+f.service+f.value)/5.0,1) DESC,f.count DESC,f.updated_at DESC`).all();
    return json({list:rows.results});
  }
  const publicFilter = "bar_id=? AND NOT (bar_id='Reply' AND (NOT EXISTS (SELECT 1 FROM community_feedback other WHERE other.device_hash=community_feedback.device_hash AND other.bar_id<>'Reply') OR (classic_score=5 AND special_score=5 AND environment_score=5 AND service_score=5 AND value_score=5 AND rank_opinion='low')))";
  const row=await env.DB.prepare(`SELECT COUNT(*) count,ROUND(AVG(classic_score),1) classic,ROUND(AVG(special_score),1) special,ROUND(AVG(environment_score),1) environment,ROUND(AVG(service_score),1) service,ROUND(AVG(value_score),1) value,SUM(rank_opinion='high') high,SUM(rank_opinion='fair') fair,SUM(rank_opinion='low') low FROM community_feedback WHERE ${publicFilter}`).bind(barId).first();
  const reviews=await env.DB.prepare(`SELECT id,classic_score,special_score,environment_score,service_score,value_score,rank_opinion,source,created_at,updated_at FROM community_feedback WHERE ${publicFilter} ORDER BY updated_at DESC, id DESC`).bind(barId).all();
  return json({
    count:row.count,
    averages:{classic:row.classic,special:row.special,environment:row.environment,service:row.service,value:row.value},
    opinions:{high:row.high,fair:row.fair,low:row.low},
    reviews:reviews.results
  });
}

export async function onRequestPost({request,env}){
  const membershipError = await requireMembership(request, env);
  if (membershipError) return membershipError;
  await ensureFeedbackTextColumns(env);
  let body;try{body=await request.json()}catch{return json({error:"invalid json"},400)}
  const barId=String(body.bar_id||"").trim(),device=String(body.device_hash||""),openid=await getOpenid(request,env),source=body.source === "mini_program" ? "mini_program" : "web",note=String(body.note||"").trim().slice(0,500),tags=JSON.stringify([...new Set((Array.isArray(body.tags)?body.tags:[]).map(tag=>String(tag).trim().slice(0,24)).filter(Boolean))].slice(0,5));
  if(source === "mini_program" && !openid)return json({error:"wechat auth required"},401);
  await bindDeviceFeedback(request,env,openid);
  if(!barId||barId.length>120||(!openid&&!/^[a-f0-9]{64}$/.test(device)))return json({error:"invalid identity"},400);
  if(scoreFields.some(field=>!Number.isInteger(body[field])||body[field]<1||body[field]>5)||!["high","fair","low"].includes(body.rank_opinion))return json({error:"invalid rating"},400);
  const existing = openid
    ? await env.DB.prepare("SELECT id FROM community_feedback WHERE bar_id=? AND (openid=? OR device_hash=?) LIMIT 1").bind(barId,openid,device).first()
    : await env.DB.prepare("SELECT id FROM community_feedback WHERE bar_id=? AND device_hash=?").bind(barId,device).first();
  if(existing){
    await env.DB.prepare("UPDATE community_feedback SET openid=COALESCE(?,openid),classic_score=?,special_score=?,environment_score=?,service_score=?,value_score=?,rank_opinion=?,source=?,note=?,tags=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(openid,...scoreFields.map(field=>body[field]),body.rank_opinion,source,note,tags,existing.id).run();
  }else{
    await env.DB.prepare("INSERT INTO community_feedback (bar_id,device_hash,openid,classic_score,special_score,environment_score,service_score,value_score,rank_opinion,source,note,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(barId,device,openid,...scoreFields.map(field=>body[field]),body.rank_opinion,source,note,tags).run();
  }
  return json({ok:true});
}
