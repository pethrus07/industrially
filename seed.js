/**
 * Seed de demonstração — cria parceiros.json, clientes.json e config.json
 * com dados FICTÍCIOS para rodar/avaliar o projeto localmente.
 *
 *   npm run seed   (ou: node seed.js)
 *
 * Esses arquivos ficam fora do git (.gitignore) porque em produção recebem
 * dados reais de leads (LGPD). Rode este seed apenas em ambiente de demo.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function write(file, data) {
  fs.writeFileSync(path.join(ROOT, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/* ---- config.json (só cria se não existir, p/ não sobrescrever ajuste real) ---- */
const configPath = path.join(ROOT, 'config.json');
if (!fs.existsSync(configPath)) write('config.json', { comissaoPctPadrao: 5 });

/* ---- parceiros.json: 1 parceiro-demo ---- */
const parceiros = {
  users: [
    {
      id: 'ptr-demo-0001',
      login: 'parceiro@celiware.com',
      nome: 'Ricardo Almeida',
      empresa: 'RA Representações Industriais',
      telefone: '(11) 98888-1234',
      senha: hashSenha('parceiro123'),
      comissaoPct: 5,
      refCode: 'ra2026',
      status: 1,
      criadoEm: '2026-07-01T12:00:00.000Z'
    }
  ]
};
write('parceiros.json', parceiros);

/* ---- clientes.json (núcleo): 1 lead interno + 6 indicações do parceiro-demo ---- */
const P = 'parceiro@celiware.com';
const padrinho = 'Ricardo Almeida';
function lead(id, nome, empresa, segmento, cidade, interesse, valor, status, dias) {
  const d = new Date('2026-07-08T12:00:00.000Z');
  d.setDate(d.getDate() - dias);
  return {
    id, nome, empresa,
    email: nome.split(' ')[0].toLowerCase() + '@' + empresa.toLowerCase().replace(/[^a-z]/g, '') + '.com.br',
    telefone: '(11) 9' + (7000 + id % 3000) + '-' + (1000 + id % 9000),
    cargo: 'Gerente Industrial', cidade, segmento, interesse,
    status, tipoLead: 'Novo', responsavel: null, valor,
    anotacoes: 'Indicação recebida via portal do parceiro.',
    indicadoPor: padrinho, links: { whatsapp: '', linkedin: '' },
    origem: 'parceiro', parceiroLogin: P, parceiroId: 'ptr-demo-0001',
    criadoEm: d.toISOString()
  };
}

const clientes = [
  {
    id: 1783358038448, nome: 'Contato interno (exemplo)', email: 'contato@exemplo.com', empresa: 'Lead do time interno',
    telefone: '11989173876', status: 'diagnostico', tipoLead: 'Novo', responsavel: 'valdir',
    valor: 0, anotacoes: '', indicadoPor: '', links: { whatsapp: '', linkedin: '' },
    ultimoFollowUp: '2026-07-06T20:24:16.068Z'
  },
  lead(2101, 'José Almeida', 'MetalCore Solutions', 'Autopeças', 'Campinas - SP', 'Célula robotizada', 350000, 'novo_lead', 1),
  lead(2102, 'Marina Lopes', 'BeverTech Drinks', 'Bebidas', 'Jundiaí - SP', 'Sistema automático de bebidas', 180000, 'em_contato', 2),
  lead(2103, 'Ricardo Nunes', 'FlexPack Industrial', 'Embalagens', 'Sorocaba - SP', 'Máquina especial', 420000, 'proposta', 4),
  lead(2104, 'Patrícia Lima', 'VisionFood Automation', 'Alimentos', 'São Paulo - SP', 'Visão computacional', 95000, 'diagnostico', 5),
  lead(2105, 'Carlos Henrique', 'RoboSteel Systems', 'Metalúrgica', 'Diadema - SP', 'Paletização robotizada', 560000, 'fechado', 9),
  lead(2106, 'Aline Souza', 'PrimeBottle Tech', 'Bebidas', 'Ribeirão Preto - SP', 'Linha automática', 780000, 'fechado', 12)
];
write('clientes.json', clientes);

console.log('Seed criado: parceiros.json (1 parceiro-demo), clientes.json (' + clientes.length + ' leads), config.json.');
console.log('Login demo do parceiro: parceiro@celiware.com / parceiro123  ·  link de indicação: /r/ra2026');
