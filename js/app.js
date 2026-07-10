/* ═══════════════════════════════════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════════════════════════════════ */
let modificados  = [];
let removidos = [];
let editandoId   = null;
let detalheAtualId = null;
let apiToken = sessionStorage.getItem('crm_api_token') || null;
let usuarioLogado = JSON.parse(sessionStorage.getItem('crm_usuario') || 'null');
const CLIENTES_PADRAO = [];
let responsavelAtual = 'neutro';

const RESPONSAVEIS = [
  { id: 'valdir', label: 'Valdir' },
  { id: 'nilton', label: 'Nilton' },
  { id: 'matheus', label: 'Matheus' },
  { id: 'neutro', label: 'Neutra' },
];

responsavelAtual = normalizarResponsavel(usuarioLogado?.login);

const PIPELINES = {
  Novo: {
    aba: 'kanban-novos',
    boardId: 'kanban-board-novos',
    buscaId: 'kanban-busca-novos',
    titulo: 'Novos Leads',
    descricao: 'Arraste os novos leads entre as etapas de prospecção.',
    tipo: 'Novo',
    final: 'fechado',
    dataFinal: 'dataFechamento',
    colunas: [
      { id: 'novo_lead', label: 'Novo Lead', emoji: '1' },
      { id: 'em_contato', label: 'Em Contato', emoji: '2' },
      { id: 'diagnostico', label: 'Diagnóstico', emoji: '3' },
      { id: 'proposta', label: 'Proposta', emoji: '4' },
      { id: 'fechado', label: 'Fechado', emoji: '5' },
    ],
  },
  Ativo: {
    aba: 'kanban-ativos',
    boardId: 'kanban-board-ativos',
    buscaId: 'kanban-busca-ativos',
    titulo: 'Clientes Ativos',
    descricao: 'Acompanhe novas oportunidades dentro da carteira ativa.',
    tipo: 'Ativo',
    final: 'fechado',
    dataFinal: 'dataFechamento',
    colunas: [
      { id: 'follow_up', label: 'Follow-up', emoji: '1' },
      { id: 'nova_oportunidade', label: 'Nova Oportunidade', emoji: '2' },
      { id: 'diagnostico', label: 'Diagnóstico', emoji: '3' },
      { id: 'proposta', label: 'Proposta', emoji: '4' },
      { id: 'fechado', label: 'Fechado', emoji: '5' },
    ],
  },
  Influenciador: {
    aba: 'kanban-influenciadores',
    boardId: 'kanban-board-influenciadores',
    buscaId: 'kanban-busca-influenciadores',
    titulo: 'Influenciadores',
    descricao: 'Gerencie relacionamento, indicações e conquistas de influenciadores.',
    tipo: 'Influenciador',
    final: 'conquistado',
    dataFinal: 'dataConquistado',
    colunas: [
      { id: 'novo_influenciador', label: 'Novo Influenciador', emoji: '1' },
      { id: 'relacionamento', label: 'Relacionamento', emoji: '2' },
      { id: 'follow_up', label: 'Follow-up', emoji: '3' },
      { id: 'nova_indicacao', label: 'Nova Indicação', emoji: '4' },
      { id: 'conquistado', label: 'Conquistado', emoji: '5' },
    ],
  },
};

const KANBAN_ABAS = {
  'kanban-novos': 'Novo',
  'kanban-ativos': 'Ativo',
  'kanban-influenciadores': 'Influenciador',
};

let kanbanTipoAtual = 'Novo';

/* ─── Drag & Drop state ─── */
let dragId       = null;   // id do cliente sendo arrastado
let ghostEl      = null;   // elemento fantasma placeholder
let dragoverCol  = null;   // coluna atual em hover

let pomodoroTotal = 25 * 60;
let pomodoroRestante = pomodoroTotal;
let pomodoroRodando = false;
let pomodoroInterval = null;
let tituloOriginal = document.title;
let pomodoroAudioContext = null;

/* ═══════════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════════ */
function mostrarLogin(mensagem = '') {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-layout').classList.add('auth-locked');

  const erro = document.getElementById('login-error');
  erro.textContent = mensagem || 'Login ou senha inválidos.';
  erro.classList.toggle('show', Boolean(mensagem));
}

function mostrarApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-layout').classList.remove('auth-locked');
}

async function loginBackend(login, senha) {
  if (!login && apiToken) return apiToken;

  const resp = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, senha })
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.erro || 'Login na API falhou.');
  }

  apiToken = data.token;
  usuarioLogado = data.usuario || null;
  sessionStorage.setItem('crm_api_token', apiToken);
  sessionStorage.setItem('crm_usuario', JSON.stringify(usuarioLogado));
  responsavelAtual = normalizarResponsavel(usuarioLogado?.login);
  return apiToken;
}

async function carregarClientesBackend() {
  const token = await loginBackend();
  const resp = await fetch('/api/clientes', {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (resp.status === 401) {
    sessionStorage.removeItem('crm_api_token');
    sessionStorage.removeItem('crm_usuario');
    apiToken = null;
    usuarioLogado = null;
  }

  if (!resp.ok) throw new Error('Erro ao buscar clientes na API.');
  return resp.json();
}

async function salvarClientesBackend() {
  if (location.protocol === 'file:' || !apiToken) return false;

  try {
    const token = await loginBackend();
    const resp = await fetch('/api/clientes', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ clientes: modificados, removidos })
    });

    if (!resp.ok) throw new Error('Erro ao salvar clientes na API.');
    return true;
  } catch (error) {
    console.warn('Não foi possível salvar no backend:', error);
    mostrarToast('Alteração local feita, mas não foi salva no backend.', 'danger');
    return false;
  }
}

function carregarClientesNaTela(dados) {
  modificados = JSON.parse(JSON.stringify(dados));
  normalizarClientesCarregados();
  atualizarStats();
  atualizarDashboard();
  renderResponsavelTabs();
  renderTabela();
  renderKanban(kanbanTipoAtual);
}

async function handleLogin(event) {
  event.preventDefault();

  const submit = document.getElementById('login-submit');
  const erro = document.getElementById('login-error');
  const login = document.getElementById('login-usuario').value.trim();
  const senha = document.getElementById('login-senha').value;

  erro.classList.remove('show');
  submit.disabled = true;
  submit.textContent = 'Entrando...';

  try {
    await loginBackend(login, senha);
    const dados = await carregarClientesBackend();
    carregarClientesNaTela(dados);
    mostrarApp();
    mostrarToast('Login realizado com sucesso.', 'success');
  } catch (error) {
    mostrarLogin(error.message || 'Login ou senha inválidos.');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Entrar';
  }
}

function logout() {
  sessionStorage.removeItem('crm_api_token');
  sessionStorage.removeItem('crm_usuario');
  apiToken = null;
  usuarioLogado = null;
  modificados = [];
  removidos = [];
  mostrarLogin();
}

async function init() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  if (!apiToken) {
    mostrarLogin();
    return;
  }

  try {
    const dados = await carregarClientesBackend();
    carregarClientesNaTela(dados);
    mostrarApp();
  } catch (error) {
    console.warn('Sessão inválida ou API indisponível:', error);
    mostrarLogin('Entre novamente para acessar os dados.');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ABAS
═══════════════════════════════════════════════════════════════════ */
function mudarAba(aba, elClicado) {
  const viewId = aba;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tabBtn = document.getElementById('tab-' + aba);
  if (tabBtn) tabBtn.classList.add('active');

  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
  if (elClicado) elClicado.classList.add('active');

  if (KANBAN_ABAS[aba]) kanbanTipoAtual = KANBAN_ABAS[aba];

  const titulos = {
    lista: 'Gestão de Clientes',
    dashboard: 'Dashboard',
    'kanban-novos': 'Novos Leads',
    'kanban-ativos': 'Clientes Ativos',
    'kanban-influenciadores': 'Influenciadores',
  };
  document.getElementById('page-title').textContent = titulos[aba] || 'CRM';

  if (KANBAN_ABAS[aba]) renderKanban(kanbanTipoAtual);
  if (aba === 'dashboard') atualizarDashboard();
}

/* ═══════════════════════════════════════════════════════════════════
   ESTATÍSTICAS
═══════════════════════════════════════════════════════════════════ */
function normalizarResponsavel(valor) {
  const id = String(valor || '').trim().toLowerCase();
  return RESPONSAVEIS.some(r => r.id === id && id !== 'neutro') ? id : 'neutro';
}

function labelResponsavel(valor) {
  const id = normalizarResponsavel(valor);
  return RESPONSAVEIS.find(r => r.id === id)?.label || 'Neutra';
}

function responsavelDoUsuario() {
  return normalizarResponsavel(usuarioLogado?.login);
}

function isProspectoAberto(c) {
  return normalizarResponsavel(c.responsavel) === 'neutro' && !statusEhFinal(c);
}

function filtrarPorResponsavel(lista) {
  if (responsavelAtual === 'neutro') return lista.filter(isProspectoAberto);
  return lista.filter(c => normalizarResponsavel(c.responsavel) === responsavelAtual);
}

function renderResponsavelTabs() {
  const container = document.getElementById('responsavel-tabs');
  if (!container) return;

  const meuResponsavel = responsavelDoUsuario();
  const tabs = [
    {
      id: meuResponsavel,
      label: `Meus clientes (${labelResponsavel(meuResponsavel)})`,
      total: modificados.filter(c => normalizarResponsavel(c.responsavel) === meuResponsavel).length,
    },
    {
      id: 'neutro',
      label: 'Leads sem responsável',
      total: modificados.filter(isProspectoAberto).length,
    },
  ];

  container.innerHTML = tabs.map(r => {
    const active = responsavelAtual === r.id ? ' active' : '';
    return `<button class="owner-tab${active}" onclick="mudarResponsavel('${r.id}')">
      ${r.label}<span class="owner-count">${r.total}</span>
    </button>`;
  }).join('');
}

function mudarResponsavel(id) {
  const meuResponsavel = responsavelDoUsuario();
  responsavelAtual = id === 'neutro' ? 'neutro' : meuResponsavel;
  renderResponsavelTabs();
  atualizarStats();
  atualizarDashboard();
  renderTabela();
  renderKanban(kanbanTipoAtual);
}

function atualizarStats() {
  const lista = filtrarPorResponsavel(modificados);
  const total = lista.length;
  const novos = lista.filter(c => normalizarTipoLead(c.tipoLead) === 'Novo').length;
  const ativos = lista.filter(c => normalizarTipoLead(c.tipoLead) === 'Ativo').length;
  const influenciadores = lista.filter(c => normalizarTipoLead(c.tipoLead) === 'Influenciador').length;
  const valor = lista.reduce((s, c) => s + (Number(c.valor) || 0), 0);

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-ativo').textContent = ativos;
  document.getElementById('stat-prospect').textContent = novos;
  document.getElementById('stat-inativo').textContent = influenciadores;
  document.getElementById('stat-valor').textContent = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}


function inicioMesAtual() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
}

function estaNoMesAtual(valor) {
  const data = parseDataCliente(valor);
  return Boolean(data && data >= inicioMesAtual());
}

function formatarMoeda(valor) {
  return `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function atualizarDashboard() {
  const lista = filtrarPorResponsavel(modificados);
  const hoje = new Date();
  const emDoisDias = new Date(hoje.getTime() + (2 * 24 * 60 * 60 * 1000));

  const fechadosMes = lista.filter(c =>
    normalizarTipoLead(c.tipoLead) !== 'Influenciador' &&
    statusEhFinal(c) &&
    estaNoMesAtual(dataFinalCliente(c))
  );
  const valorFechadoMes = fechadosMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);

  const influenciadoresConquistados = lista.filter(c =>
    normalizarTipoLead(c.tipoLead) === 'Influenciador' &&
    statusEhFinal(c) &&
    estaNoMesAtual(dataFinalCliente(c))
  ).length;

  const propostas = lista.filter(c => normalizarStatusLead(c.status, c.tipoLead) === 'proposta');
  const valorPropostas = propostas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const vencidos = lista.filter(c => {
    const data = parseDataCliente(c.proximaData);
    return data && data < hoje && !statusEhFinal(c);
  }).length;
  const proximos = lista.filter(c => {
    const data = parseDataCliente(c.proximaData);
    return data && data >= hoje && data <= emDoisDias && !statusEhFinal(c);
  }).length;

  const setText = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  };

  setText('dash-valor-fechado', formatarMoeda(valorFechadoMes));
  setText('dash-influenciadores', influenciadoresConquistados);
  setText('dash-propostas', propostas.length);
  setText('dash-valor-propostas', formatarMoeda(valorPropostas));
  setText('dash-vencidos', vencidos);
  setText('dash-proximos', proximos);

  renderDashboardPipelines(lista);
  renderDashboardResponsaveis(lista);
}

function renderDashboardPipelines(lista) {
  const container = document.getElementById('dash-pipelines');
  if (!container) return;

  container.innerHTML = Object.values(PIPELINES).map(pipeline => {
    const itens = lista.filter(c => normalizarTipoLead(c.tipoLead) === pipeline.tipo);
    const abertos = itens.filter(c => !statusEhFinal(c)).length;
    const finais = itens.filter(statusEhFinal).length;
    const valorAberto = itens.filter(c => !statusEhFinal(c)).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    return `
      <div class="dashboard-row">
        <div>
          <strong>${pipeline.titulo}</strong>
          <span>${abertos} abertos • ${finais} finalizados</span>
        </div>
        <b>${formatarMoeda(valorAberto)}</b>
      </div>
    `;
  }).join('');
}

function renderDashboardResponsaveis(lista) {
  const container = document.getElementById('dash-responsaveis');
  if (!container) return;

  container.innerHTML = RESPONSAVEIS.map(resp => {
    const itens = lista.filter(c => normalizarResponsavel(c.responsavel) === resp.id);
    const abertas = itens.filter(c => !statusEhFinal(c)).length;
    const propostas = itens.filter(c => normalizarStatusLead(c.status, c.tipoLead) === 'proposta').length;
    return `
      <div class="dashboard-row">
        <div>
          <strong>${resp.label}</strong>
          <span>${abertas} abertas • ${propostas} em proposta</span>
        </div>
        <b>${itens.length}</b>
      </div>
    `;
  }).join('');
}
/* ═══════════════════════════════════════════════════════════════════
   TABELA (VIEW LISTA)
═══════════════════════════════════════════════════════════════════ */
function pipelinePorTipo(tipo) {
  return PIPELINES[normalizarTipoLead(tipo)] || PIPELINES.Novo;
}

function colunaPadraoTipo(tipo) {
  return pipelinePorTipo(tipo).colunas[0].id;
}

function todasColunas() {
  return Object.values(PIPELINES).flatMap(p => p.colunas.map(col => ({ ...col, tipo: p.tipo })));
}

function labelStatus(status, tipoLead = '') {
  const pipeline = pipelinePorTipo(tipoLead);
  const coluna = pipeline.colunas.find(col => col.id === status) || todasColunas().find(col => col.id === status);
  return coluna ? coluna.label : (status || 'Sem status');
}

function normalizarStatusLead(status, tipoLead) {
  const pipeline = pipelinePorTipo(tipoLead);
  const valor = String(status || '').trim().toLowerCase();
  const existe = pipeline.colunas.some(col => col.id === valor);
  if (existe) return valor;

  const legado = {
    prospect: { Novo: 'novo_lead', Ativo: 'nova_oportunidade', Influenciador: 'novo_influenciador' },
    negociacao: { Novo: 'em_contato', Ativo: 'nova_oportunidade', Influenciador: 'relacionamento' },
    ativo: { Novo: 'em_contato', Ativo: 'follow_up', Influenciador: 'relacionamento' },
    fechado: { Novo: 'fechado', Ativo: 'fechado', Influenciador: 'conquistado' },
    inativo: { Novo: 'novo_lead', Ativo: 'follow_up', Influenciador: 'follow_up' },
    perdido: { Novo: 'novo_lead', Ativo: 'follow_up', Influenciador: 'follow_up' },
  };

  return legado[valor]?.[pipeline.tipo] || colunaPadraoTipo(pipeline.tipo);
}

function normalizarClientesCarregados() {
  modificados = modificados.map(c => {
    const tipoLead = normalizarTipoLead(c.tipoLead) || 'Novo';
    return {
      ...c,
      tipoLead,
      status: normalizarStatusLead(c.status, tipoLead),
    };
  });
}

function statusEhFinal(c) {
  const pipeline = pipelinePorTipo(c.tipoLead);
  return normalizarStatusLead(c.status, c.tipoLead) === pipeline.final;
}

function dataFinalCliente(c) {
  const pipeline = pipelinePorTipo(c.tipoLead);
  return c[pipeline.dataFinal] || c.dataFechamento || c.dataConquistado || c.fechadoEm || c.conquistadoEm;
}

function registrarDataFinalSeNecessario(cliente, statusAntigo = '') {
  const pipeline = pipelinePorTipo(cliente.tipoLead);
  const statusAtual = normalizarStatusLead(cliente.status, cliente.tipoLead);
  if (statusAtual !== pipeline.final || statusAntigo === statusAtual) return;
  cliente[pipeline.dataFinal] = new Date().toISOString();
}

function normalizarTipoLead(tipo) {
  const valor = String(tipo || '').trim().toLowerCase();
  if (valor === 'novos' || valor === 'novo') return 'Novo';
  if (valor === 'ativos' || valor === 'ativo') return 'Ativo';
  if (valor === 'influenciador') return 'Influenciador';
  return tipo || '';
}

function parseDataCliente(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataHora(valor) {
  const data = parseDataCliente(valor);
  if (!data) return 'Sem registro';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function valorDatetimeLocal(valor) {
  const data = parseDataCliente(valor);
  if (!data) return '';
  const offset = data.getTimezoneOffset() * 60000;
  return new Date(data.getTime() - offset).toISOString().slice(0, 16);
}

function classePrazoCard(proximaData) {
  const proxima = parseDataCliente(proximaData);
  if (!proxima) return '';

  const agora = new Date();
  const hojeInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const proximaInicio = new Date(proxima.getFullYear(), proxima.getMonth(), proxima.getDate());
  const emDoisDias = new Date(agora.getTime() + (2 * 24 * 60 * 60 * 1000));

  if (proxima < agora) return 'card-prazo-atrasado';
  if (proximaInicio.getTime() === hojeInicio.getTime()) return 'card-prazo-hoje';
  if (proxima <= emDoisDias) return 'card-prazo-proximo';
  return '';
}

function renderTabela() {
  const busca  = document.getElementById('busca').value.toLowerCase();
  const status = document.getElementById('filtro-status').value;
  const ordem  = document.getElementById('filtro-ordem').value;

  let lista = filtrarPorResponsavel(modificados);

  if (busca) {
    lista = lista.filter(c =>
      c.nome?.toLowerCase().includes(busca) ||
      c.email?.toLowerCase().includes(busca) ||
      c.empresa?.toLowerCase().includes(busca)
    );
  }

  if (status) lista = lista.filter(c => c.status === status);

  lista.sort((a, b) => {
    if (ordem === 'valor')  return (b.valor || 0) - (a.valor || 0);
    if (ordem === 'status') return (a.status || '').localeCompare(b.status || '');
    return (a.nome || '').localeCompare(b.nome || '');
  });

  const tbody = document.getElementById('tabela-body');

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state"><div class="icon">🔍</div>Nenhum cliente encontrado.</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map((c, i) => `
    <tr>
      <td style="color:#aaa;font-size:.8rem">${i + 1}</td>
      <td>
        <div class="td-nome">${esc(c.nome)}</div>
        <div class="td-empresa">${esc(c.empresa || '—')}${c.origem === 'parceiro' ? ` <span style="color:#f07830;font-size:.72rem;font-weight:600">· 🤝 ${esc(c.indicadoPor || 'Parceiro')}</span>` : ''}</div>
      </td>
      <td>${esc(c.telefone || '—')}</td>
      <td><span class="badge badge-${c.status}">${labelStatus(c.status, c.tipoLead)}</span></td>
      <td>R$ ${Number(c.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td>
        <div class="td-actions">
          <button class="btn btn-sm" style="background:#e0f2fe;color:#0284c7"
            onclick="verDetalhes(${c.id})">👁 Ver</button>
          <button class="btn btn-edit btn-sm"
            onclick="abrirModalEditar(${c.id})">✏️ Editar</button>
          <button class="btn btn-danger btn-sm"
            onclick="excluirCliente(${c.id})">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════════
   KANBAN – RENDER
═══════════════════════════════════════════════════════════════════ */
function renderKanban(tipo = kanbanTipoAtual) {
  kanbanTipoAtual = normalizarTipoLead(tipo) || 'Novo';
  const pipeline = pipelinePorTipo(kanbanTipoAtual);
  const busca = (document.getElementById(pipeline.buscaId)?.value || '').toLowerCase();
  const board = document.getElementById(pipeline.boardId);
  if (!board) return;

  board.innerHTML = '';

  pipeline.colunas.forEach(col => {
    let cards = filtrarPorResponsavel(modificados).filter(c =>
      normalizarTipoLead(c.tipoLead) === pipeline.tipo &&
      normalizarStatusLead(c.status, c.tipoLead) === col.id
    );

    if (busca) {
      cards = cards.filter(c =>
        c.nome?.toLowerCase().includes(busca) ||
        c.email?.toLowerCase().includes(busca) ||
        c.empresa?.toLowerCase().includes(busca)
      );
    }

    const valorCol = cards.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const colEl = document.createElement('div');
    colEl.className = `kanban-col col-${col.id}`;
    colEl.dataset.status = col.id;

    colEl.innerHTML = `
      <div class="kanban-col-header">
        <div class="kanban-col-title">
          <span class="kanban-col-dot"></span>
          ${col.emoji} ${col.label}
        </div>
        <span class="kanban-count">${cards.length}</span>
      </div>
    `;

    const cardsEl = document.createElement('div');
    cardsEl.className = 'kanban-cards';
    cardsEl.dataset.status = col.id;
    cardsEl.dataset.tipo = pipeline.tipo;

    cardsEl.addEventListener('dragover', onDragOver);
    cardsEl.addEventListener('dragleave', onDragLeave);
    cardsEl.addEventListener('drop', onDrop);

    cards.forEach(c => cardsEl.appendChild(criarCard(c)));

    if (!cards.length) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'color:#bbb;font-size:0.82rem;text-align:center;padding:24px 12px;';
      emptyEl.textContent = 'Nenhum cliente aqui';
      cardsEl.appendChild(emptyEl);
    }

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:8px 14px 12px;font-size:0.78rem;color:#888;border-top:1px solid #e8e8f0;margin-top:2px;flex-shrink:0;';
    footer.textContent = `Total: R$ ${valorCol.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    colEl.appendChild(cardsEl);
    colEl.appendChild(footer);
    board.appendChild(colEl);
  });
}

/* ─── Criar card ─── */
function criarCard(c) {
  const card = document.createElement('div');
  const classePrazo = classePrazoCard(c.proximaData);
  card.className   = `kanban-card${classePrazo ? ` ${classePrazo}` : ''}`;
  card.draggable   = true;
  card.dataset.id  = c.id;

  const tipoLead = normalizarTipoLead(c.tipoLead);
  const ultimoFollowUp = formatarDataHora(c.ultimoFollowUp);
  const proximaData = formatarDataHora(c.proximaData);
  const valorProximaData = valorDatetimeLocal(c.proximaData);

  card.innerHTML = `
    <div class="card-actions">
      <button class="card-action-btn" title="Ver detalhes"
        onclick="verDetalhes(${c.id})">👁</button>
      <button class="card-action-btn" title="Editar"
        onclick="abrirModalEditar(${c.id})">✏️</button>
      <button class="card-action-btn" title="Excluir"
        onclick="excluirCliente(${c.id})" style="color:#ef4444">🗑</button>
    </div>
    <div class="card-nome">${esc(c.nome)}</div>
    <div class="card-empresa">${esc(c.empresa || '—')}</div>
    ${c.origem === 'parceiro' ? `<div class="card-info" style="color:#f07830;font-weight:600">🤝 Parceiro: ${esc(c.indicadoPor || '—')}</div>` : ''}
    ${c.email    ? `<div class="card-info">📧 ${esc(c.email)}</div>` : ''}
    ${c.telefone ? `<div class="card-info">📞 ${esc(c.telefone)}</div>` : ''}
    ${tipoLead ? `<div class="card-info card-tipo-lead">🏷️ ${esc(tipoLead)}</div>` : ''}
    <div class="card-followup">
      <div class="card-date-row">
        <span class="card-date-label">Último Follow Up</span>
        <button class="card-date-btn" title="Registrar follow up agora"
          onclick="event.stopPropagation(); registrarUltimoFollowUp(${c.id})">Hoje</button>
      </div>
      <div class="card-date-value">${esc(ultimoFollowUp)}</div>
      <div class="card-date-row card-next-row">
        <span class="card-date-label">Próxima Data</span>
        <button class="card-date-btn" title="Escolher próxima data"
          onclick="event.stopPropagation(); abrirCalendarioProximaData(${c.id})">Calendário</button>
        <input class="card-date-input" id="proxima-data-${c.id}" type="datetime-local"
          value="${esc(valorProximaData)}"
          onclick="event.stopPropagation()"
          onchange="atualizarProximaData(${c.id}, this.value)" />
      </div>
      <div class="card-date-value">${esc(proximaData)}</div>
    </div>
    ${c.notas    ? `<div class="card-info" style="color:#aaa;font-style:italic;font-size:.76rem">
                      💬 ${esc(c.notas.substring(0, 60))}${c.notas.length > 60 ? '…' : ''}
                    </div>` : ''}
    <div class="card-valor">
      R$ ${Number(c.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
    </div>
  `;

  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragend',   onDragEnd);

  return card;
}

/* ═══════════════════════════════════════════════════════════════════
   DRAG & DROP
═══════════════════════════════════════════════════════════════════ */
function onDragStart(e) {
  dragId = parseInt(this.dataset.id);
  this.classList.add('dragging');

  // Cria ghost placeholder
  ghostEl = document.createElement('div');
  ghostEl.className = 'kanban-ghost';

  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  this.classList.remove('dragging');
  if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
  ghostEl = null;
  dragoverCol = null;

  // Remove highlight de todas as colunas
  document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const col = this; // .kanban-cards

  if (dragoverCol !== col) {
    // Remove highlight anterior
    document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over'));
    col.classList.add('drag-over');
    dragoverCol = col;

    // Move ghost para esta coluna
    if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
    if (ghostEl) col.appendChild(ghostEl);
  }
}

function onDragLeave(e) {
  // Só remove se saiu da coluna de verdade (não para um filho)
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('drag-over');
  }
}

function onDrop(e) {
  e.preventDefault();
  const novoStatus = this.dataset.status;
  const novoTipo = this.dataset.tipo || kanbanTipoAtual;

  if (dragId == null || !novoStatus) return;

  const idx = modificados.findIndex(c => c.id === dragId);
  if (idx === -1) return;

  const statusAntigo = modificados[idx].status;

  if (statusAntigo !== novoStatus) {
    modificados[idx].tipoLead = normalizarTipoLead(novoTipo) || modificados[idx].tipoLead;
    modificados[idx].status = novoStatus;
    registrarDataFinalSeNecessario(modificados[idx], statusAntigo);
    atualizarStats();
    atualizarDashboard();
    renderTabela();
    mostrarToast(
      `"${modificados[idx].nome}" → ${labelStatus(novoStatus, modificados[idx].tipoLead)}`,
      'info'
    );
  }

  this.classList.remove('drag-over');
  renderKanban(kanbanTipoAtual);
  if (statusAntigo !== novoStatus) salvarClientesBackend();
  dragId = null;
}

function registrarUltimoFollowUp(id) {
  const cliente = modificados.find(c => c.id === id);
  if (!cliente) return;

  cliente.ultimoFollowUp = new Date().toISOString();
  mostrarToast('Último Follow Up registrado.', 'success');
  renderTabela();
  renderKanban(kanbanTipoAtual);
  salvarClientesBackend();
}

function abrirCalendarioProximaData(id) {
  const input = document.getElementById(`proxima-data-${id}`);
  if (!input) return;

  input.focus();
  if (typeof input.showPicker === 'function') {
    input.showPicker();
  } else {
    input.click();
  }
}

function atualizarProximaData(id, valor) {
  const cliente = modificados.find(c => c.id === id);
  if (!cliente) return;

  cliente.proximaData = valor ? new Date(valor).toISOString() : '';
  mostrarToast('Próxima Data atualizada.', 'success');
  renderTabela();
  renderKanban(kanbanTipoAtual);
  salvarClientesBackend();
}
/* ═══════════════════════════════════════════════════════════════════
   VER DETALHES
═══════════════════════════════════════════════════════════════════ */
function verDetalhes(id) {
  const c = modificados.find(x => x.id === id);
  if (!c) return;
  detalheAtualId = id;

  document.getElementById('det-nome').textContent     = c.nome     || '—';
  document.getElementById('det-email').textContent    = c.email    || '—';
  document.getElementById('det-telefone').textContent = c.telefone || '—';
  document.getElementById('det-empresa').textContent  = c.empresa  || '—';
  document.getElementById('det-valor').textContent    =
    'R$ ' + Number(c.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  document.getElementById('det-id').textContent       = c.id;
  document.getElementById('det-responsavel').textContent = labelResponsavel(c.responsavel);
  document.getElementById('det-tipoLead').textContent = normalizarTipoLead(c.tipoLead) || '—';
  document.getElementById('det-indicadoPor').textContent = c.indicadoPor || '—';
  document.getElementById('det-ultimoFollowUp').textContent = formatarDataHora(c.ultimoFollowUp);
  document.getElementById('det-proximaData').textContent = formatarDataHora(c.proximaData);
  document.getElementById('det-anotacoes').textContent    = c.anotacoes || 'Sem anotações.';
  
  // Configurar links
  const linkWpp = document.getElementById('det-linkWhatsapp');
  const linkLin = document.getElementById('det-linkLinkedin');
  
  if (c.links && c.links.whatsapp) {
    linkWpp.href = c.links.whatsapp;
    linkWpp.style.display = 'inline';
  } else {
    linkWpp.style.display = 'none';
  }
  
  if (c.links && c.links.linkedin) {
    linkLin.href = c.links.linkedin;
    linkLin.style.display = 'inline';
  } else {
    linkLin.style.display = 'none';
  }
  
  document.getElementById('det-status').innerHTML     =
    `<span class="badge badge-${c.status}">${labelStatus(c.status, c.tipoLead)}</span>`;

  abrirModal('modal-detalhes');
}

function editarDoDetalhe() {
  fecharModal('modal-detalhes');
  if (detalheAtualId != null) abrirModalEditar(detalheAtualId);
}

/* ═══════════════════════════════════════════════════════════════════
   NOVO / EDITAR
═══════════════════════════════════════════════════════════════════ */
function atualizarStatusForm(statusSelecionado = '') {
  const tipo = normalizarTipoLead(document.getElementById('f-tipoLead')?.value) || 'Novo';
  const statusEl = document.getElementById('f-status');
  if (!statusEl) return;

  const pipeline = pipelinePorTipo(tipo);
  const statusValido = pipeline.colunas.some(col => col.id === statusSelecionado)
    ? statusSelecionado
    : colunaPadraoTipo(tipo);

  statusEl.innerHTML = pipeline.colunas.map(col =>
    `<option value="${col.id}">${col.label}</option>`
  ).join('');
  statusEl.value = statusValido;
}
function abrirModalNovo() {
  editandoId = null;
  document.getElementById('modal-form-titulo').textContent = '➕ Novo Cliente';
  limparForm();
  abrirModal('modal-form');
}

function abrirModalEditar(id) {
  const c = modificados.find(x => x.id === id);
  if (!c) return;
  editandoId = id;
  document.getElementById('modal-form-titulo').textContent = '✏️ Editar Cliente';
  document.getElementById('f-nome').value     = c.nome     || '';
  document.getElementById('f-empresa').value  = c.empresa  || '';
  document.getElementById('f-email').value    = c.email    || '';
  document.getElementById('f-telefone').value = c.telefone || '';
  document.getElementById('f-tipoLead').value = normalizarTipoLead(c.tipoLead) || 'Novo';
  atualizarStatusForm(normalizarStatusLead(c.status, c.tipoLead));
  document.getElementById('f-responsavel').value = normalizarResponsavel(c.responsavel) === 'neutro' ? '' : normalizarResponsavel(c.responsavel);
  document.getElementById('f-valor').value    = c.valor    || '';
  document.getElementById('f-indicadoPor').value = c.indicadoPor || '';
  document.getElementById('f-linkWhatsapp').value = (c.links && c.links.whatsapp) || '';
  document.getElementById('f-linkLinkedin').value = (c.links && c.links.linkedin) || '';
  document.getElementById('f-notas').value    = c.anotacoes    || '';
  abrirModal('modal-form');
}

function limparForm() {
  document.getElementById('f-nome').value     = '';
  document.getElementById('f-empresa').value  = '';
  document.getElementById('f-email').value    = '';
  document.getElementById('f-telefone').value = '';
  document.getElementById('f-tipoLead').value = 'Novo';
  atualizarStatusForm();
  document.getElementById('f-responsavel').value = '';
  document.getElementById('f-valor').value    = '';
  document.getElementById('f-indicadoPor').value = '';
  document.getElementById('f-linkWhatsapp').value = '';
  document.getElementById('f-linkLinkedin').value = '';
  document.getElementById('f-notas').value    = '';
}

function salvarCliente() {
  const nome  = document.getElementById('f-nome').value.trim();
  const email = document.getElementById('f-email').value.trim();

  if (!nome)  { mostrarToast('O nome é obrigatório.', 'danger'); return; }
  if (!email) { mostrarToast('O e-mail é obrigatório.', 'danger'); return; }

  const novoCliente = {
    nome, email,
    empresa:  document.getElementById('f-empresa').value.trim(),
    telefone: document.getElementById('f-telefone').value.trim(),
    status:   document.getElementById('f-status').value,
    tipoLead: normalizarTipoLead(document.getElementById('f-tipoLead').value),
    responsavel: document.getElementById('f-responsavel').value || null,
    valor:    parseFloat(document.getElementById('f-valor').value) || 0,
    anotacoes: document.getElementById('f-notas').value.trim(),
    indicadoPor: document.getElementById('f-indicadoPor').value.trim(),
    links: {
      whatsapp: document.getElementById('f-linkWhatsapp').value.trim(),
      linkedin: document.getElementById('f-linkLinkedin').value.trim()
    }
  };

  if (editandoId !== null) {
    const idx = modificados.findIndex(x => x.id === editandoId);
    if (idx !== -1) {
      const statusAntigo = modificados[idx].status;
      modificados[idx] = { ...modificados[idx], ...novoCliente };
      registrarDataFinalSeNecessario(modificados[idx], statusAntigo);
    }
    mostrarToast('Cliente atualizado com sucesso!', 'success');
  } else {
    const novoRegistro = {
      id: Date.now(),
      ...novoCliente,
      responsavel: document.getElementById('f-responsavel').value || responsavelDoUsuario(),
    };
    registrarDataFinalSeNecessario(novoRegistro);
    modificados.push(novoRegistro);
    mostrarToast('Cliente criado com sucesso!', 'success');
  }

  fecharModal('modal-form');
  normalizarClientesCarregados();
  atualizarStats();
  atualizarDashboard();
  renderResponsavelTabs();
  renderTabela();
  renderKanban(kanbanTipoAtual);
  salvarClientesBackend();
}

function excluirCliente(id) {
  if (!confirm('Deseja realmente excluir este cliente?')) return;

  const clienteId = typeof id === 'string' ? parseInt(id) : id;
  const idx = modificados.findIndex(c => c.id === clienteId);
  if (idx !== -1) {
    const nome = modificados[idx].nome;
    removidos.push(clienteId);
    modificados.splice(idx, 1);
    mostrarToast(`Cliente "${nome}" excluído.`, 'success');
    atualizarStats();
    atualizarDashboard();
    renderResponsavelTabs();
    renderTabela();
    renderKanban(kanbanTipoAtual);
    salvarClientesBackend().then((ok) => { if (ok) removidos = []; });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MODAIS
═══════════════════════════════════════════════════════════════════ */
function abrirModal(id) {
  document.getElementById(id).classList.add('open');
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.open').forEach(m => m.classList.remove('open'));
  }
});

document.querySelectorAll('.overlay').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════════ */
function mostrarToast(mensagem, tipo = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensagem;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ═══════════════════════════════════════════════════════════════════
   POMODORO
═══════════════════════════════════════════════════════════════════ */
function formatarPomodoro(segundos) {
  const min = Math.floor(segundos / 60).toString().padStart(2, '0');
  const sec = (segundos % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

function atualizarPomodoroUI() {
  const timer = document.getElementById('pomodoro-time');
  const botao = document.getElementById('pomodoro-toggle');
  const box = document.getElementById('pomodoro');
  if (!timer || !botao || !box) return;

  const textoTempo = formatarPomodoro(pomodoroRestante);
  timer.textContent = textoTempo;
  botao.textContent = pomodoroRodando ? 'Pausar' : 'Iniciar';
  box.classList.toggle('running', pomodoroRodando);
  box.classList.toggle('done', pomodoroRestante === 0);
  document.title = pomodoroRodando ? `${textoTempo} • Foco` : tituloOriginal;
}

function prepararSomPomodoro() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!pomodoroAudioContext) pomodoroAudioContext = new AudioContext();
  if (pomodoroAudioContext.state === 'suspended') pomodoroAudioContext.resume();
}

function tocarAlertaPomodoro() {
  prepararSomPomodoro();
  if (!pomodoroAudioContext) return;

  [0, 0.35, 0.7].forEach((delay) => {
    const inicio = pomodoroAudioContext.currentTime + delay;
    const osc = pomodoroAudioContext.createOscillator();
    const ganho = pomodoroAudioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, inicio);
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.18, inicio + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.22);

    osc.connect(ganho);
    ganho.connect(pomodoroAudioContext.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.24);
  });
}

function finalizarPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroRodando = false;
  pomodoroRestante = 0;
  atualizarPomodoroUI();
  tocarAlertaPomodoro();
  mostrarToast('Pomodoro concluído. Hora de respirar e revisar o próximo contato.', 'success');
  document.title = 'Pomodoro concluído';
}

function tickPomodoro() {
  pomodoroRestante -= 1;
  if (pomodoroRestante <= 0) {
    finalizarPomodoro();
    return;
  }
  atualizarPomodoroUI();
}

function alterarDuracaoPomodoro(minutos) {
  const novaDuracao = Number(minutos);
  if (![5, 10, 15, 25, 45].includes(novaDuracao)) return;

  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroRodando = false;
  pomodoroTotal = novaDuracao * 60;
  pomodoroRestante = pomodoroTotal;
  document.title = tituloOriginal;
  atualizarPomodoroUI();
}
function togglePomodoro() {
  prepararSomPomodoro();

  if (pomodoroRodando) {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroRodando = false;
    atualizarPomodoroUI();
    return;
  }

  if (pomodoroRestante <= 0) pomodoroRestante = pomodoroTotal;
  pomodoroRodando = true;
  pomodoroInterval = setInterval(tickPomodoro, 1000);
  atualizarPomodoroUI();
}

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroRodando = false;
  pomodoroRestante = pomodoroTotal;
  document.title = tituloOriginal;
  atualizarPomodoroUI();
}
/* ═══════════════════════════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════════════════════════ */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exportarJSON() {
  const dataStr = JSON.stringify(modificados, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `crm-clientes-${new Date().toISOString().split('T')[0]}.json`);
  link.click();
}

/* Inicializar */
window.addEventListener('load', init);
window.addEventListener('DOMContentLoaded', () => {
  renderResponsavelTabs();
  atualizarPomodoroUI();
});






















