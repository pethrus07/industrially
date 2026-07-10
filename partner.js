const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════════
   CELIWARE SALES — Backend do Portal do Parceiro
   Mesmo padrão do CRM: Node puro + API + arquivos JSON.
   O núcleo de dados é o clientes.json (compartilhado com o CRM):
   a indicação do parceiro NASCE como um lead lá dentro.
═══════════════════════════════════════════════════════════════════ */

const PARCEIROS_FILE = path.join(__dirname, 'parceiros.json');
const CLIENTES_FILE = path.join(__dirname, 'clientes.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const sessions = new Map();

/* ─────────────────────────── HTTP helpers ─────────────────────────── */
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Payload muito grande.'));
      }
    });
    req.on('end', () => {
      if (!body) { resolve({}); return; }
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('JSON invalido.')); }
    });
  });
}

function getToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/* ─────────────────────────── JSON store ─────────────────────────── */
async function readJsonFile(filePath, fallback) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data.replace(/^﻿/, ''));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readParceiros() {
  const db = await readJsonFile(PARCEIROS_FILE, { users: [] });
  if (!Array.isArray(db.users)) throw new Error('parceiros.json precisa conter uma lista users.');
  return db;
}

async function readClientes() {
  const clientes = await readJsonFile(CLIENTES_FILE, []);
  return Array.isArray(clientes) ? clientes : [];
}

async function writeClientes(clientes) {
  await writeJsonFile(CLIENTES_FILE, clientes);
}

async function comissaoPadrao() {
  const cfg = await readJsonFile(CONFIG_FILE, { comissaoPctPadrao: 5 });
  return Number(cfg.comissaoPctPadrao) || 5;
}

/* ─────────────────────────── Senha (hash) ─────────────────────────── */
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verificarSenha(senha, armazenada) {
  const parts = String(armazenada || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    // Compatibilidade com seed antigo em texto puro
    return String(senha) === String(armazenada);
  }
  const [, salt, hash] = parts;
  const teste = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(teste, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ─────────────────────────── Código de indicação (link/QR) ─────────────────────────── */
function gerarRefCode() {
  return crypto.randomBytes(4).toString('hex'); // 8 caracteres
}

async function refCodeUnico(db) {
  let code;
  do { code = gerarRefCode(); } while (db.users.some(u => u.refCode === code));
  return code;
}

async function findParceiroByRefCode(code) {
  const alvo = String(code || '').trim().toLowerCase();
  if (!alvo) return null;
  const db = await readParceiros();
  return db.users.find(u => String(u.refCode || '').toLowerCase() === alvo && Number(u.status) !== 0) || null;
}

/* ─────────────────────────── Regras de negócio ─────────────────────────── */
function toMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value ?? '').replace(/[^\d,.-]/g, '');
  // formato brasileiro: 1.234.567,89 → remove pontos de milhar, vírgula vira ponto
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const number = Number(s);
  return Number.isFinite(number) ? number : 0;
}

// Traduz a etapa interna do CRM para o status simplificado que o parceiro vê.
function statusParceiro(lead) {
  const s = String(lead.status || '').trim().toLowerCase();
  if (lead.perdido === true || s === 'perdido' || s === 'descartado') return 'Perdida';
  if (['fechado', 'conquistado', 'ganho', 'vendido'].includes(s)) return 'Fechada';
  if (['diagnostico', 'proposta', 'follow_up', 'nova_oportunidade', 'nova_indicacao', 'negociacao'].includes(s)) return 'Em negociação';
  return 'Em análise';
}

function estaFechada(lead) {
  return statusParceiro(lead) === 'Fechada';
}

function pctDoParceiro(parceiro, padrao) {
  const pct = Number(parceiro.comissaoPct);
  return Number.isFinite(pct) && pct > 0 ? pct : padrao;
}

function comissaoDoLead(lead, pct) {
  const valor = Number(lead.valor || 0);
  const valorComissao = Math.round(valor * pct) / 100;
  return {
    valorComissao,
    status: estaFechada(lead) ? 'Confirmada' : 'Prevista',
  };
}

/* Um lead (do clientes.json) visto como Indicação (contato bruto) */
function leadComoIndicacao(lead) {
  return {
    id: lead.id,
    company: lead.empresa || lead.nome || 'Empresa indicada',
    person: lead.nome || lead.contato || 'Contato',
    position: lead.cargo || 'Contato indicado',
    segment: lead.segmento || '—',
    city: lead.cidade || '—',
    interest: lead.interesse || lead.projeto || '—',
    email: lead.email || '',
    phone: lead.telefone || '',
    stage: statusParceiro(lead),
    createdAt: lead.criadoEm || lead.createdAt || null,
  };
}

/* O mesmo lead visto como Oportunidade (negócio com estágio/valor/comissão) */
function leadComoOportunidade(lead, pct) {
  const fechada = estaFechada(lead);
  const com = comissaoDoLead(lead, pct);
  return {
    id: lead.id,
    company: lead.empresa || lead.nome || 'Empresa indicada',
    type: lead.interesse || lead.projeto || 'Projeto',
    value: Number(lead.valor || 0),
    stage: statusParceiro(lead),
    accepted: fechada,
    segment: lead.segmento || '—',
    comissaoPct: pct,
    comissaoValor: com.valorComissao,
    comissaoStatus: com.status,
    createdAt: lead.criadoEm || lead.createdAt || null,
  };
}

function montarDashboard(oportunidades) {
  const aceitas = oportunidades.filter(o => o.accepted);
  const comissaoConfirmada = aceitas.reduce((s, o) => s + (o.comissaoValor || 0), 0);
  const comissaoPrevista = oportunidades
    .filter(o => !o.accepted)
    .reduce((s, o) => s + (o.comissaoValor || 0), 0);
  return {
    totalIndications: oportunidades.length,
    totalOpportunities: oportunidades.length,
    totalOpportunityValue: oportunidades.reduce((s, o) => s + Number(o.value || 0), 0),
    acceptedOpportunities: aceitas.length,
    pendingOpportunities: oportunidades.length - aceitas.length,
    comissaoConfirmada,
    comissaoPrevista,
    comissaoTotal: comissaoConfirmada + comissaoPrevista,
  };
}

async function publicPartnerData(parceiro) {
  const padrao = await comissaoPadrao();
  const pct = pctDoParceiro(parceiro, padrao);
  const clientes = await readClientes();
  const meus = clientes.filter(c => String(c.parceiroLogin || '').toLowerCase() === String(parceiro.login).toLowerCase());

  // Mais recentes primeiro
  meus.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));

  const indications = meus.map(leadComoIndicacao);
  const opportunities = meus.map(lead => leadComoOportunidade(lead, pct));
  const commissions = opportunities.map(o => ({
    company: o.company,
    type: o.type,
    valorNegocio: o.value,
    pct: o.comissaoPct,
    valorComissao: o.comissaoValor,
    status: o.comissaoStatus,
  }));

  return {
    user: {
      name: parceiro.nome || parceiro.user?.name || parceiro.login,
      company: parceiro.empresa || parceiro.user?.company || '',
      comissaoPct: pct,
      refCode: parceiro.refCode || null,
    },
    dashboard: montarDashboard(opportunities),
    indications,
    opportunities,
    commissions,
  };
}

async function getCurrentPartner(req, res) {
  const token = getToken(req);
  if (!token || !sessions.has(token)) {
    sendJson(res, 401, { status: 0, message: 'Nao autorizado.' });
    return null;
  }
  const db = await readParceiros();
  const session = sessions.get(token);
  const parceiro = db.users.find(u => String(u.login).toLowerCase() === session.login && Number(u.status) !== 0);
  if (!parceiro) {
    sessions.delete(token);
    sendJson(res, 401, { status: 0, message: 'Sessao invalida.' });
    return null;
  }
  return parceiro;
}

function criarSessao(parceiro) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { login: String(parceiro.login).toLowerCase(), createdAt: Date.now() });
  return token;
}

/* ─────────────────────────── Validação de indicação ─────────────────────────── */
function validarIndicacao(body) {
  const company = String(body.company || '').trim();
  const contactName = String(body.contactName || body.person || '').trim();
  const project = String(body.project || body.interest || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const segment = String(body.segment || '').trim();
  const city = String(body.city || '').trim();
  const position = String(body.position || '').trim();
  const value = toMoney(body.value);
  const notes = String(body.notes || '').trim();

  if (!company) throw new Error('Informe a empresa indicada.');
  if (!contactName) throw new Error('Informe o nome do contato.');
  if (!project) throw new Error('Informe o interesse / projeto.');
  if (!email) throw new Error('Informe o e-mail do contato.');
  if (!phone) throw new Error('Informe o telefone do contato.');
  if (!segment) throw new Error('Informe o segmento.');

  return { company, contactName, project, email, phone, segment, city, position, value, notes };
}

// A indicação nasce como LEAD no clientes.json (o núcleo do CRM).
function indicacaoParaLead(form, parceiro) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    nome: form.contactName,
    empresa: form.company,
    email: form.email,
    telefone: form.phone,
    cargo: form.position,
    cidade: form.city,
    segmento: form.segment,
    interesse: form.project,
    status: 'novo_lead',
    tipoLead: 'Novo',
    responsavel: null,          // "neutro" → aparece p/ todo o time interno no CRM
    valor: form.value || 0,
    anotacoes: form.notes,
    indicadoPor: parceiro.nome || parceiro.user?.name || parceiro.login,
    links: { whatsapp: '', linkedin: '' },
    origem: 'parceiro',
    parceiroLogin: String(parceiro.login).toLowerCase(),
    parceiroId: parceiro.id || null,
    criadoEm: new Date().toISOString(),
  };
}

/* ─────────────────────────── API ─────────────────────────── */
async function handlePartnerApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  /* ---- SIGNUP: o parceiro cria a própria conta ---- */
  if (pathname === '/api/partner/signup' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const nome = String(body.nome || body.name || '').trim();
      const empresa = String(body.empresa || body.company || '').trim();
      const email = String(body.email || body.login || '').trim().toLowerCase();
      const telefone = String(body.telefone || body.phone || '').trim();
      const senha = String(body.senha || body.password || '');

      if (!nome) return sendJson(res, 400, { status: 0, message: 'Informe seu nome.' });
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { status: 0, message: 'Informe um e-mail válido.' });
      if (senha.length < 6) return sendJson(res, 400, { status: 0, message: 'A senha precisa ter ao menos 6 caracteres.' });

      const db = await readParceiros();
      if (db.users.some(u => String(u.login).toLowerCase() === email)) {
        return sendJson(res, 409, { status: 0, message: 'Já existe uma conta com esse e-mail.' });
      }

      const parceiro = {
        id: crypto.randomUUID(),
        login: email,
        nome,
        empresa,
        telefone,
        senha: hashSenha(senha),
        comissaoPct: null,        // usa o % padrão até o gestor definir
        refCode: await refCodeUnico(db),
        status: 1,
        criadoEm: new Date().toISOString(),
      };
      db.users.push(parceiro);
      await writeJsonFile(PARCEIROS_FILE, db);

      const token = criarSessao(parceiro);
      sendJson(res, 201, { status: 1, token, ...(await publicPartnerData(parceiro)) });
    } catch (error) {
      sendJson(res, 400, { status: 0, message: error.message || 'Nao foi possivel criar a conta.' });
    }
    return;
  }

  /* ---- LOGIN ---- */
  if (pathname === '/api/partner/login' && req.method === 'POST') {
    const body = await readBody(req);
    const login = String(body.login || body.username || body.email || '').trim().toLowerCase();
    const senha = String(body.password || body.senha || '');
    const db = await readParceiros();
    const parceiro = db.users.find(u =>
      String(u.login).toLowerCase() === login && Number(u.status) !== 0
    );

    if (!parceiro || !verificarSenha(senha, parceiro.senha ?? parceiro.password)) {
      sendJson(res, 401, { status: 0, message: 'E-mail ou senha invalidos.' });
      return;
    }

    const token = criarSessao(parceiro);
    sendJson(res, 200, { status: 1, token, ...(await publicPartnerData(parceiro)) });
    return;
  }

  /* ---- DASHBOARD ---- */
  if (pathname === '/api/partner/dashboard' && req.method === 'GET') {
    const parceiro = await getCurrentPartner(req, res);
    if (!parceiro) return;
    sendJson(res, 200, { status: 1, ...(await publicPartnerData(parceiro)) });
    return;
  }

  /* ---- NOVA INDICAÇÃO (vira lead no clientes.json) ---- */
  if (pathname === '/api/partner/opportunities' && req.method === 'POST') {
    const parceiro = await getCurrentPartner(req, res);
    if (!parceiro) return;
    try {
      const body = await readBody(req);
      const form = validarIndicacao(body);
      const lead = indicacaoParaLead(form, parceiro);

      const clientes = await readClientes();
      clientes.push(lead);
      await writeClientes(clientes);

      const updated = await publicPartnerData(parceiro);
      sendJson(res, 201, { status: 1, indication: leadComoIndicacao(lead), ...updated });
    } catch (error) {
      sendJson(res, 400, { status: 0, message: error.message || 'Nao foi possivel salvar a indicacao.' });
    }
    return;
  }

  /* ---- LOGOUT ---- */
  if (pathname === '/api/partner/logout' && req.method === 'POST') {
    const token = getToken(req);
    if (token) sessions.delete(token);
    sendJson(res, 200, { status: 1 });
    return;
  }

  sendJson(res, 404, { status: 0, message: 'Endpoint partner nao encontrado.' });
}

/* ─────────────────────────── API pública de indicação (link/QR) ─────────────────────────── */
async function handleReferApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }
  const code = pathname.replace('/api/refer/', '').split('/')[0];

  // GET público: dados do padrinho para a página de indicação
  if (req.method === 'GET') {
    const parceiro = await findParceiroByRefCode(code);
    if (!parceiro) { sendJson(res, 404, { status: 0, message: 'Link de indicação inválido.' }); return; }
    sendJson(res, 200, {
      status: 1,
      padrinho: { name: parceiro.nome || parceiro.login, empresa: parceiro.empresa || '', refCode: parceiro.refCode },
    });
    return;
  }

  // POST público: cria a indicação já atrelada ao padrinho
  if (req.method === 'POST') {
    const parceiro = await findParceiroByRefCode(code);
    if (!parceiro) { sendJson(res, 404, { status: 0, message: 'Link de indicação inválido.' }); return; }
    try {
      const body = await readBody(req);
      const form = validarIndicacao(body);
      const lead = indicacaoParaLead(form, parceiro);
      lead.via = 'link';
      const clientes = await readClientes();
      clientes.push(lead);
      await writeClientes(clientes);
      sendJson(res, 201, { status: 1, message: 'Indicação recebida! A IndustriAlly entrará em contato em breve.' });
    } catch (error) {
      sendJson(res, 400, { status: 0, message: error.message || 'Nao foi possivel enviar a indicacao.' });
    }
    return;
  }

  sendJson(res, 404, { status: 0, message: 'Endpoint refer nao encontrado.' });
}

module.exports = { handlePartnerApi, handleReferApi };
