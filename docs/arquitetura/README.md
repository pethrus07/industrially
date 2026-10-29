# Arquitetura

Três vistas do sistema, cada uma numa notação padrão.

| Vista | Notação | Responde |
|---|---|---|
| 1. Casos de uso | UML | Quem usa e para quê |
| 2. Processo | BPMN 2.0 | Como o trabalho anda, com uma raia para cada quem executa |
| 3. Arquitetura | C4, nível 2 | De que partes o sistema é feito e com quem conversa |

## IndustriAlly · CRM e portal de parceiros

Plataforma única da Celiware (um domínio, um login) que junta o CRM interno da equipe e o portal onde parceiros indicam indústrias e acompanham a comissão. Node puro, sem dependências, dados em JSON. Arquivada; serviu de base ao Expert Work.

### 1. Quem usa e para quê

![Casos de uso de IndustriAlly](./industrially-1-casos-de-uso.svg)

### 2. Da indicação à comissão confirmada

![Processo de IndustriAlly](./industrially-2-processo.svg)

### 3. Arquitetura

![Arquitetura de IndustriAlly](./industrially-3-arquitetura.svg)

Para editar: [industrially.excalidraw](./industrially.excalidraw), que abre em [excalidraw.com](https://excalidraw.com) ou na extensão Excalidraw do VS Code.

## De onde vêm

Os diagramas são gerados a partir do Sinapse, o vault onde o Pedro organiza notas e projetos. Mudança feita direto aqui some na próxima publicação: o lugar de mudar é a especificação no Sinapse.
