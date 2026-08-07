# OSRM Route Explorer

> Ferramenta profissional, 100% front-end, para testar, validar e demonstrar **servidores OSRM**. Sem backend, toda a comunicação acontece direto do navegador.

![HTML5-CSS3-JS6](https://img.shields.io/badge/HTML5-CSS3-ES6-E34F26?style=flat-square&logo=css3)
![Bootstrap 5](https://img.shields.io/badge/Bootstrap%205-7952B3?style=flat-square&logo=bootstrap&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet%201.9-199900?style=flat-square&logo=leaflet&logoColor=white)
![OSRM v5](https://img.shields.io/badge/OSRM%20v5-4B3BBE?style=flat-square&logo=git&logoColor=white)

---

## ✨ Funcionalidades

### Endpoints OSRM

- **Route** – rota entre múltiplos waypoints, com alternativas e instruções.
- **Trip** – rota de todos os pontos (travelling salesman).
- **Table** – matriz de tempos/distâncias.
- **Match** – rastreamento de pontos para trilhas.
- **Nearest** – ponto de rua mais próximo.

### Mapa

- Alternância entre **Padrão (OSM)** e **Satélite (Esri)**.
- Waypoints **numerados**, arrastáveis e editáveis.
- Grade de coordenadas (graticule), escala e modo tela cheia.
- Clique no mapa para adicionar pontos; coordenadas do mouse ao vivo.

### Geocodificação

- Endereços com **Nominatim** (fallback **Photon**) e autocomplete.
- CEP por **ViaCEP**; geolocalização por **Nominatim estruturado**.

### Mais recursos

- **Exportação**: GeoJSON, JSON e GPX.
- **Histórico** de buscas e **configurações** persistentes (LocalStorage).
- Abas de resultado: Info, Rotas, Instruções, Matriz, JSON e URL da requisição.
- Controle de cor/espessura das rotas e logs de API no console.

---

## 🖥️ Capturas de tela

| Mapa e rota                  | Resposta JSON                |
| ---------------------------- | ---------------------------- |
| _(adicione sua imagem aqui)_ | _(adicione sua imagem aqui)_ |

---

## 🚀 Como executar

O app precisa de um **servidor HTTP local** (evita o bloqueio de CORS/origin do `file://`):

```bash
# Opção 1 — Python
python -m http.server 8080

# Opção 2 — Node
npx serve .
```

Acesse: `http://localhost:8080/index.html`

---

## ⚙️ Configuração

1. Clique em **Configurações** (engrenagem) no topo.
2. Informe o **endereço do servidor OSRM**, o **perfil** (`driving`, `cycling`, `walking`), **latitude/longitude/zoom** iniciais e o **mapa inicial**.
3. Clique em **Salvar**.

As configurações são salvas no navegador (LocalStorage).

---

## 📦 Estrutura do projeto

```
OSRM_Route_Explorer/
├── index.html          # layout principal + CDNs
├── css/
│   └── style.css       # estilo customizado
└── js/
    ├── utils.js        # CONFIG (config) e State (estado global)
    ├── storage.js      # Store — LocalStorage/histórico/cache
    ├── geocoder.js     # Nominatim, ViaCEP, Photon, CEP
    ├── osrm.js         # cliente HTTP OSRM (route/trip/table/match/nearest)
    ├── map.js          # MapController — Leaflet (camadas, waypoints, rotas)
    ├── ui.js           # Ui — renderização de tabelas, painéis e modais
    └── app.js          # orquestração, eventos e chamada da API
```

### Tecnologias

- **HTML5 / CSS3 / JavaScript ES6** (sem frameworks de aplicação)
- **Bootstrap 5** + **Bootstrap Icons**
- **Leaflet 1.9.4** (com fallback de CDN)
- **OSRM API v5**

---

## 🖥️ Testar com um servidor OSRM

1. Suba seu serviço (ex.: `osrm-routed --algorithm mld car.osrm`).
2. No app, defina o servidor e adicione **2+ pontos** no mapa.
3. Clique em **Calcular** e veja os resultados nas abas.

> 💡 O `js/osrm.js` grava no console (`[OSRM]`) a **URL** e a **resposta** de toda requisição — ótimo para depurar.

---

## 🔒 Notas

- Tudo roda no navegador; os únicos acessos externos são as APIs públicas (OSM, Esri, Nominatim, ViaCEP, Photon).
- Respeite a política de uso dos serviços gratuitos (caching e identificação própria).

---

## 📄 Licença

Distribuído sob licença **MIT**.

---

Feito com ❤️ e **Leaflet**.
