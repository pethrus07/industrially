const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { handlePartnerApi, handleReferApi } = require('./partner');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'clientes.json');

const sessions = new Map();
// Usuários internos do CRM. EM PRODUÇÃO defina as senhas por variável de
// ambiente (CRM_PASS_*); os valores abaixo são apenas para demonstração local.
// Os logins (valdir/nilton/matheus) são usados como "responsável" no Kanban.
const users = [
  { id: 1, nome: 'Valdir (Comercial)', login: 'valdir', email: 'valdir@industrially.local', senha: process.env.CRM_PASS_VALDIR || 'demo1234' },
  { id: 2, nome: 'Nilton (Comercial)', login: 'nilton', email: 'nilton@industrially.local', senha: process.env.CRM_PASS_NILTON || 'demo1234' },
  { id: 3, nome: 'Matheus (Comercial)', login: 'matheus', email: 'matheus@industrially.local', senha: process.env.CRM_PASS_MATHEUS || 'demo1234' },
];

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON invalido.'));
      }
    });
  });
}

function getToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function requireAuth(req, res) {
  const token = getToken(req);

  if (!token || !sessions.has(token)) {
    sendJson(res, 401, { erro: 'Nao autorizado.' });
    return null;
  }

  return sessions.get(token);
}

async function readClientes() {
  const data = await fs.readFile(DATA_FILE, 'utf8');
  const clientes = JSON.parse(data.replace(/^\uFEFF/, ''));

  if (!Array.isArray(clientes)) {
    throw new Error('clientes.json precisa conter uma lista.');
  }

  return clientes;
}

async function writeClientes(clientes) {
  if (!Array.isArray(clientes)) {
    throw new Error('Envie uma lista de clientes.');
  }

  await fs.writeFile(DATA_FILE, `${JSON.stringify(clientes, null, 2)}\n`, 'utf8');
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (pathname.startsWith('/api/partner/')) {
    await handlePartnerApi(req, res, pathname);
    return;
  }

  if (pathname.startsWith('/api/refer/')) {
    await handleReferApi(req, res, pathname);
    return;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const login = String(body.login || body.email || '').trim().toLowerCase();
    const senha = String(body.senha || body.password || '');
    const user = users.find(u =>
      (u.login.toLowerCase() === login || u.email.toLowerCase() === login) &&
      u.senha === senha
    );

    if (!user) {
      sendJson(res, 401, { erro: 'Login ou senha invalidos.' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { id: user.id, nome: user.nome, login: user.login, email: user.email });

    sendJson(res, 200, {
      token,
      usuario: { id: user.id, nome: user.nome, login: user.login, email: user.email },
    });
    return;
  }

  if (pathname === '/api/clientes' && req.method === 'GET') {
    const usuario = requireAuth(req, res);
    if (!usuario) return;
    
    let clientes = await readClientes();
    
    // Filtrar clientes por usuário - cada usuário vê apenas seus próprios leads + leads sem responsável
    const userLogin = usuario.login.toLowerCase();
    clientes = clientes.filter(c => {
      const cResponsavel = String(c.responsavel || '').trim().toLowerCase();
      // Vê seus próprios clientes
      if (cResponsavel === userLogin) return true;
      // Vê leads sem responsável que ainda não foram finalizados
      const status = String(c.status || '').trim().toLowerCase();
      if (!cResponsavel && !['fechado', 'conquistado'].includes(status)) return true;
      return false;
    });
    
    sendJson(res, 200, clientes);
    return;
  }

  if (pathname === '/api/clientes' && req.method === 'PUT') {
    const usuario = requireAuth(req, res);
    if (!usuario) return;
    const body = await readBody(req);
    const clienteUpdate = Array.isArray(body) ? body : (body.clientes || []);
    const removidos = Array.isArray(body.removidos) ? body.removidos : [];

    // Validar que o usuário não está mudando responsabilidade de clientes que não são seus
    const todosClientes = await readClientes();
    const podeAlterar = (clienteOriginal) => {
      const origemResponsavel = String(clienteOriginal.responsavel || '').trim().toLowerCase();
      const status = String(clienteOriginal.status || '').trim().toLowerCase();
      return origemResponsavel === usuario.login.toLowerCase() || (!origemResponsavel && !['fechado', 'conquistado'].includes(status));
    };

    for (const clienteAtualizado of clienteUpdate) {
      const clienteOriginal = todosClientes.find(c => c.id === clienteAtualizado.id);
      if (clienteOriginal && !podeAlterar(clienteOriginal)) {
        sendJson(res, 403, { erro: 'Você não tem permissão para editar este cliente.' });
        return;
      }
    }

    for (const idRemovido of removidos) {
      const clienteOriginal = todosClientes.find(c => c.id === idRemovido);
      if (clienteOriginal && !podeAlterar(clienteOriginal)) {
        sendJson(res, 403, { erro: 'Você não tem permissão para excluir este cliente.' });
        return;
      }
    }

    const atualizadosPorId = new Map(clienteUpdate.map(c => [c.id, c]));
    const removidosSet = new Set(removidos);
    const idsExistentes = new Set(todosClientes.map(c => c.id));
    const clientesMesclados = todosClientes
      .filter(c => !removidosSet.has(c.id))
      .map(c => atualizadosPorId.get(c.id) || c);

    for (const clienteAtualizado of clienteUpdate) {
      if (!idsExistentes.has(clienteAtualizado.id)) {
        clientesMesclados.push(clienteAtualizado);
      }
    }

    await writeClientes(clientesMesclados);
    sendJson(res, 200, { ok: true, total: clientesMesclados.length });
    return;
  }

  sendJson(res, 404, { erro: 'Endpoint nao encontrado.' });
}

async function serveStatic(req, res, pathname) {
  const routes = {
    '/': '/index.html',
    '/crm': '/crm.html',
    '/partner': '/partner.html',
    '/vendas': '/partner.html',
  };
  let requestedPath = routes[pathname] || pathname;
  if (pathname === '/r' || pathname.startsWith('/r/')) requestedPath = '/refer.html';
  const decodedPath = decodeURIComponent(requestedPath);

  if (['/clientes.json', '/dados.json', '/partner.json', '/parceiros.json', '/config.json', '/comissoes.json', '/oportunidade.json', '/oportunidades.json', '/server.js', '/partner.js', '/package.json', '/Teste.Etiqueta.js'].includes(decodedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo nao encontrado.');
    return;
  }

  const filePath = path.normalize(path.join(ROOT_DIR, decodedPath));

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Acesso negado.');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo nao encontrado.');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { erro: error.message || 'Erro interno.' });
  }
});

server.listen(PORT, () => {
  console.log(`CRM rodando em http://localhost:${PORT}`);
  console.log(`Login demo: ${users[0].email} / ${users[0].senha}`);
});





