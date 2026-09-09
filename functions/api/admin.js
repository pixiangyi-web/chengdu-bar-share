const json=(data,status=200)=>Response.json(data,{status,headers:{"cache-control":"no-store"}});

function base64urlBytes(value){const normalized=String(value).replace(/-/g,"+").replace(/_/g,"/");const padding="=".repeat((4-normalized.length%4)%4);return Uint8Array.from(atob(normalized+padding),char=>char.charCodeAt(0))}
function decode(value){try{return JSON.parse(new TextDecoder().decode(base64urlBytes(value)))}catch{return null}}
async function identity(request,env){try{const value=request.headers.get("x-session-token")||request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");const [payload,signature]=String(value||"").split(".");const secret=env.SESSION_SECRET||env.WECHAT_APPSECRET;if(!payload||!signature||!secret)return null;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);const valid=await crypto.subtle.verify("HMAC",key,base64urlBytes(signature),new TextEncoder().encode(payload));const data=decode(payload);return valid&&data?.openid&&data.exp>Math.floor(Date.now()/1000)?data.openid:null}catch{return null}}
function isAdmin(openid,env){const allowed=String(env.ADMIN_OPENIDS||env.ADMIN_OPENID||"").split(/[\s,]+/).map(value=>value.trim()).filter(Boolean);return Boolean(openid&&allowed.includes(openid))}
async function ensureOverrides(env){await env.DB.prepare("CREATE TABLE IF NOT EXISTS catalog_overrides (bar_name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run()}
async function ensureFeedbackText(env){for(const sql of ["ALTER TABLE community_feedback ADD COLUMN note TEXT NOT NULL DEFAULT ''","ALTER TABLE community_feedback ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"]){try{await env.DB.prepare(sql).run()}catch{}}}
async function catalog(request,env){const response=await fetch(new URL("/catalog.json",request.url));const data=await response.json();await ensureOverrides(env);const {results}=await env.DB.prepare("SELECT bar_name,data FROM catalog_overrides").all();const overrides=new Map(results.map(row=>[row.bar_name,JSON.parse(row.data)]));return {...data,bars:data.bars.map(bar=>({...bar,...(overrides.get(bar.name)||{})}))}}

export async function onRequestGet({request,env}){
  const openid=await identity(request,env);if(!isAdmin(openid,env))return json({error:"forbidden"},403);
  await ensureOverrides(env);await ensureFeedbackText(env);
  const [feedback,tags,nominations,fullCatalog]=await Promise.all([
    env.DB.prepare("SELECT id,bar_id,classic_score,special_score,environment_score,service_score,value_score,rank_opinion,source,note,tags,created_at,updated_at FROM community_feedback ORDER BY updated_at DESC,id DESC").all(),
    env.DB.prepare("SELECT id,bar_name,suggested_tags,note,status,source,created_at,reviewed_at FROM bar_tag_suggestions ORDER BY created_at DESC,id DESC").all(),
    env.DB.prepare("SELECT id,bar_name,area,bar_type,source_url,reason,status,source,created_at FROM bar_nominations ORDER BY created_at DESC,id DESC").all(),
    catalog(request,env)
  ]);
  return json({openid,feedback:feedback.results.map(row=>({...row,tags:JSON.parse(row.tags||"[]")})),tags:tags.results.map(row=>({...row,tags:JSON.parse(row.suggested_tags||"[]")})),nominations:nominations.results,bars:fullCatalog.bars});
}

export async function onRequestPut({request,env}){
  const openid=await identity(request,env);if(!isAdmin(openid,env))return json({error:"forbidden"},403);
  let body;try{body=await request.json()}catch{return json({error:"invalid json"},400)}
  await ensureOverrides(env);
  if(body.action==="approve_tags"){
    const barName=String(body.bar_name||'').trim();
    const selected=new Set(Array.isArray(body.tags)?body.tags.filter(tag=>typeof tag==='string'):[]);
    if(!barName||!selected.size)return json({error:'请选择待审标签'},400);
    const {results}=await env.DB.prepare("SELECT id,suggested_tags FROM bar_tag_suggestions WHERE lower(trim(bar_name))=lower(?) AND status='pending'").bind(barName).all();
    const approved=new Set(),statements=[];
    for(const row of results){
      const tags=JSON.parse(row.suggested_tags||'[]');
      const matches=tags.filter(tag=>selected.has(tag));
      if(!matches.length)continue;
      matches.forEach(tag=>approved.add(tag));
      const remaining=tags.filter(tag=>!selected.has(tag));
      statements.push(env.DB.prepare("UPDATE bar_tag_suggestions SET suggested_tags=?,status=?,reviewed_at=CASE WHEN ?='pending' THEN NULL ELSE CURRENT_TIMESTAMP END WHERE id=? AND status='pending'").bind(JSON.stringify(remaining.length?remaining:tags),remaining.length?'pending':'accepted',remaining.length?'pending':'accepted',row.id));
    }
    if(!approved.size)return json({error:'标签已处理，请刷新'},409);
    statements.push(env.DB.prepare("INSERT INTO bar_tag_suggestions (bar_name,suggested_tags,note,device_hash,source,status,reviewed_at) VALUES (?,?,'',?,'mini_program','accepted',CURRENT_TIMESTAMP)").bind(barName,JSON.stringify([...approved]),crypto.randomUUID()));
    await env.DB.batch(statements);
  }else if(body.action==="tag_status"){
    const status=["pending","accepted","rejected"].includes(body.status)?body.status:"pending";
    await env.DB.prepare("UPDATE bar_tag_suggestions SET status=?,reviewed_at=CASE WHEN ?='pending' THEN NULL ELSE CURRENT_TIMESTAMP END WHERE id=?").bind(status,status,Number(body.id)).run();
  }else if(body.action==="nomination_status"){
    const status=["pending","reviewing","accepted","rejected"].includes(body.status)?body.status:"pending";
    await env.DB.prepare("UPDATE bar_nominations SET status=? WHERE id=?").bind(status,Number(body.id)).run();
  }else if(body.action==="remove_tag"){
    const barName=String(body.bar_name||"").trim(),tag=String(body.tag||"").trim();
    if(!barName||!tag)return json({error:"invalid tag"},400);
    const {results}=await env.DB.prepare("SELECT id,suggested_tags FROM bar_tag_suggestions WHERE bar_name=? AND status='accepted'").bind(barName).all();
    for(const row of results){const tags=JSON.parse(row.suggested_tags||"[]").filter(value=>value!==tag);await env.DB.prepare("UPDATE bar_tag_suggestions SET suggested_tags=?,status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(tags),tags.length?"accepted":"rejected",row.id).run()}
  }else if(body.action==="update_bar"){
    const name=String(body.bar_name||"").trim(),data=body.data;
    if(!name||!data||typeof data!=="object")return json({error:"invalid bar"},400);
    const allowed={};["name","average","type","area","areaKey","dianpingUrl","features","lat","lon"].forEach(key=>{if(data[key]!==undefined)allowed[key]=data[key]});
    await env.DB.prepare("INSERT OR REPLACE INTO catalog_overrides (bar_name,data,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind(name,JSON.stringify(allowed)).run();
  }else{return json({error:"unknown action"},400)}
  return json({ok:true});
}
