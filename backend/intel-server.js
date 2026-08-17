#!/usr/bin/env node
'use strict';
/**
 * 拿下 Nail It · 极简后端（校招情报同步 + 问题反馈接收）
 * 零依赖（仅 Node 内置模块），可直接跑在 CloudBase / EdgeOne / 任意 Node 环境。
 *
 * 环境变量：
 *   PORT            监听端口（默认 3000）
 *   ADMIN_KEY       管理员密钥（上传情报 / 读反馈必须带；默认 "rfa-admin-2026"）
 *   STATIC_DIR      静态目录（默认 = 本文件上级目录，即放 our-plugin-web-v4-white.html 的地方）
 *   FEEDBACK_WEBHOOK 反馈转发 Webhook（可选；设置了就把每条反馈 POST 过去，例如企业微信/飞书/Slack 机器人）
 *   FEEDBACK_EMAIL  反馈抄送邮箱（仅写入日志展示，不实际发信）
 *
 * 接口：
 *   GET  /api/intel           公开：返回 { csv, updatedAt, version, count }
 *   POST /api/intel/upload   管理员(Bearer ADMIN_KEY)：body { csv } 更新情报
 *   POST /api/feedback       公开：body { t, ver, page, desc, contact? } 接收反馈
 *   GET  /api/feedback       管理员(Bearer ADMIN_KEY)：列出全部反馈
 *   GET  /admin              管理后台页（上传 CSV / 看反馈）
 *   其余路径               静态托管（默认页 our-plugin-web-v4-white.html）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'rfa-admin-2026';
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
// 优先用仓库根的 index.html（部署形态），否则退回产品页原文件名
const HTML_FILE = (()=>{ const a=path.join(STATIC_DIR,'index.html'); if(fs.existsSync(a)) return a; return path.join(STATIC_DIR,'our-plugin-web-v4-white.html'); })();

const INTEL_FILE = path.join(DATA_DIR, 'intel.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

/* ---------- 工具 ---------- */
function ensureDir(d){ try{ fs.mkdirSync(d, { recursive: true }); }catch(e){} }
function readJSON(file, fallback){
  try{ const s = fs.readFileSync(file, 'utf8'); return JSON.parse(s); }catch(e){ return fallback; }
}
function writeJSON(file, obj){
  ensureDir(DATA_DIR);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}
function shortHash(str){
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 10);
}
function send(res, code, obj, headers){
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}
function readBody(req){
  return new Promise((resolve, reject)=>{
    let data = '';
    let tooBig = false;
    req.on('data', chunk => { data += chunk; if(data.length > 5*1024*1024){ tooBig = true; req.destroy(); } });
    req.on('end', ()=> tooBig ? reject(new Error('body too large')) : resolve(data));
    req.on('error', reject);
  });
}
function bearerOk(req){
  const h = req.headers['authorization'] || '';
  return h === 'Bearer ' + ADMIN_KEY || h === 'Bearer '+encodeURIComponent(ADMIN_KEY);
}

/* ---------- 校招情报：内置 CSV 兜底抽取 ---------- */
function extractBuiltinCsv(){
  try{
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    const m = html.match(/<script id="rfaJobCsv"[^>]*>([\s\S]*?)<\/script>/);
    if(m && m[1] && m[1].trim().split('\n').length > 2) return m[1].trim();
  }catch(e){ console.error('[seed] 抽取内置 CSV 失败：', e.message); }
  return '';
}
function countRows(csv){
  if(!csv) return 0;
  return csv.trim().split('\n').filter(l=>l.trim()).length - 1; // 减表头
}
function seedIntelIfNeeded(){
  if(fs.existsSync(INTEL_FILE)) return;
  const csv = extractBuiltinCsv();
  const now = Date.now();
  const obj = {
    csv: csv,
    updatedAt: now,
    version: csv ? shortHash(csv) : 'empty',
    count: countRows(csv),
    seededFrom: csv ? 'builtin-html' : 'blank',
    note: '首次启动自动从产品页内置 CSV 播种；此后以管理员上传为准。'
  };
  writeJSON(INTEL_FILE, obj);
  console.log('[seed] 已用内置 CSV 播种情报数据：' + obj.count + ' 条');
}

/* ---------- 反馈转发（Webhook / 日志） ---------- */
async function forwardFeedback(item){
  const url = process.env.FEEDBACK_WEBHOOK;
  if(!url) return;
  try{
    const payload = JSON.stringify({ msgtype:'text', text:{ content:
      '【拿下 Nail It 用户反馈】\n时间：'+(item.t||'')+'\n版本：'+(item.ver||'')+'\n页面：'+(item.page||'')+
      (item.contact?('\n联系方式：'+item.contact):'')+'\n描述：'+(item.desc||'') } });
    const u = new URL(url);
    const isHttp = u.protocol === 'http:' || u.protocol === 'https:';
    if(isHttp){
      const lib = u.protocol === 'https:' ? require('https') : require('http');
      const data = Buffer.from(payload);
      const req = lib.request(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length': data.length } }, r=>{ r.resume(); });
      req.on('error', e=>console.error('[webhook] 转发失败：', e.message));
      req.write(data); req.end();
    }
  }catch(e){ console.error('[webhook] 转发异常：', e.message); }
}

/* ---------- 静态托管 ---------- */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.csv':'text/csv; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2' };
function serveStatic(req, res, urlPath){
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if(rel === '/' || rel === '') rel = fs.existsSync(path.join(STATIC_DIR,'index.html')) ? '/index.html' : '/our-plugin-web-v4-white.html';
  // 防目录穿越
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(STATIC_DIR, safe);
  if(!filePath.startsWith(STATIC_DIR)){ res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(filePath, (err, st)=>{
    if(err || !st.isFile()){
      // 单页应用兜底：找不到就回产品页
      const idx = path.join(STATIC_DIR, 'our-plugin-web-v4-white.html');
      if(fs.existsSync(idx)){ res.writeHead(200, {'Content-Type': MIME['.html']}); fs.createReadStream(idx).pipe(res); }
      else { res.writeHead(404); res.end('not found'); }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res)=>{
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  try{
    // 健康检查（部署平台探活用）
    if(req.method === 'GET' && pathname === '/api/health'){
      return send(res, 200, { ok:true, ts:Date.now() });
    }

    // 管理后台页
    if(req.method === 'GET' && pathname === '/admin'){
      const adminPath = path.join(__dirname, 'admin.html');
      if(fs.existsSync(adminPath)){ res.writeHead(200, {'Content-Type': MIME['.html']}); fs.createReadStream(adminPath).pipe(res); }
      else { res.writeHead(404); res.end('admin.html not found'); }
      return;
    }

    // 校招情报：公开读
    if(req.method === 'GET' && pathname === '/api/intel'){
      const intel = readJSON(INTEL_FILE, null);
      if(!intel){ return send(res, 404, { error:'intel not ready' }); }
      return send(res, 200, { csv: intel.csv, updatedAt: intel.updatedAt, version: intel.version, count: intel.count });
    }

    // 校招情报：管理员上传
    if(req.method === 'POST' && pathname === '/api/intel/upload'){
      if(!bearerOk(req)) return send(res, 401, { error:'unauthorized' });
      const raw = await readBody(req);
      let body; try{ body = JSON.parse(raw); }catch(e){ return send(res, 400, { error:'invalid json' }); }
      if(!body.csv || typeof body.csv !== 'string') return send(res, 400, { error:'csv required' });
      const now = Date.now();
      const obj = { csv: body.csv, updatedAt: now, version: shortHash(body.csv), count: countRows(body.csv), note:'由管理员上传' };
      writeJSON(INTEL_FILE, obj);
      console.log('[intel] 管理员上传情报：' + obj.count + ' 条 @ ' + new Date(now).toISOString());
      return send(res, 200, { ok:true, updatedAt: now, version: obj.version, count: obj.count });
    }

    // 问题反馈：公开提交
    if(req.method === 'POST' && pathname === '/api/feedback'){
      const raw = await readBody(req);
      let body; try{ body = JSON.parse(raw); }catch(e){ return send(res, 400, { error:'invalid json' }); }
      const item = {
        t: body.t || new Date().toISOString(),
        ver: body.ver || '',
        page: body.page || '',
        contact: (body.contact || '').toString().slice(0, 200),
        desc: (body.desc || '').toString().slice(0, 5000),
      };
      if(!item.desc.trim()) return send(res, 400, { error:'desc required' });
      const list = readJSON(FEEDBACK_FILE, []);
      list.unshift(item);
      writeJSON(FEEDBACK_FILE, list);
      console.log('[feedback] 收到反馈 @ ' + item.t + '：' + item.desc.slice(0, 60));
      forwardFeedback(item);
      return send(res, 200, { ok:true, id: item.t });
    }

    // 问题反馈：管理员读取
    if(req.method === 'GET' && pathname === '/api/feedback'){
      if(!bearerOk(req)) return send(res, 401, { error:'unauthorized' });
      const list = readJSON(FEEDBACK_FILE, []);
      return send(res, 200, { total: list.length, items: list.slice(0, 200) });
    }

    // 兜底：静态托管
    if(req.method === 'GET' || req.method === 'HEAD'){ return serveStatic(req, res, url); }
    return send(res, 404, { error:'not found' });
  }catch(e){
    console.error('[err]', e);
    send(res, 500, { error: String(e && e.message || e) });
  }
});

seedIntelIfNeeded();
server.listen(PORT, '0.0.0.0', ()=>{
  console.log('拿下 Nail It 后端已启动： http://localhost:' + PORT);
  console.log('  校招情报： GET  /api/intel');
  console.log('  管理后台： GET  /admin  (上传需 ADMIN_KEY=' + ADMIN_KEY + ')');
  console.log('  静态目录： ' + STATIC_DIR);
});
