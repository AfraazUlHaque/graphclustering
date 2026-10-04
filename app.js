/* ============================================================
   GraphClusterLab — app.js
   Full client-side simulation of 5 graph clustering algorithms
   ============================================================ */

// ─── Global State ────────────────────────────────────────────
const state = {
  graph: null,          // { nodes, edges }
  graphType: 'random',
  nodeCount: 40,
  edgeDensity: 0.15,
  kClusters: 4,
  speed: 1,
  activeAlgos: new Set(['kmeans', 'spectral', 'louvain']),
  results: {},          // algo → { labels, modularity, silhouette, runtime, numClusters }
  running: false,
};

const ALGO_META = {
  kmeans:   { name: 'K-Means Graph',      color: '#7c5cfc' },
  spectral: { name: 'Spectral Clustering', color: '#00d4ff' },
  louvain:  { name: 'Louvain Method',      color: '#f97316' },
  dbscan:   { name: 'DBSCAN',             color: '#ec4899' },
  girvan:   { name: 'Girvan-Newman',       color: '#22c55e' },
};

const CLUSTER_PALETTE = [
  '#7c5cfc','#00d4ff','#f97316','#ec4899','#22c55e',
  '#eab308','#06b6d4','#a855f7','#14b8a6','#f43f5e',
];

// ─── Helpers ─────────────────────────────────────────────────
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

function updateSliderVal(sliderId, labelId, scale = 1) {
  const val = parseFloat(document.getElementById(sliderId).value) * scale;
  const display = scale < 1 ? val.toFixed(2) : val;
  document.getElementById(labelId).textContent = display;
  if (sliderId === 'node-count')   state.nodeCount   = parseInt(val);
  if (sliderId === 'edge-density') state.edgeDensity = val;
  if (sliderId === 'k-clusters')   state.kClusters   = parseInt(val);
}

function setGraphType(btn, type) {
  state.graphType = type;
  document.querySelectorAll('#graph-type-group .btn-toggle').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function toggleAlgo(algo, enabled) {
  if (enabled) state.activeAlgos.add(algo);
  else         state.activeAlgos.delete(algo);
}

function setSpeed(btn, s) {
  state.speed = s;
  btn.closest('.btn-group').querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function fitView() { renderAll(); }

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function dist2D(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ─── Background Particles ─────────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('bg-particles');
  const ctx = canvas.getContext('2d');
  let pts = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    initPts();
  }

  function initPts() {
    pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: rand(-0.15, 0.15),
      vy: rand(-0.15, 0.15),
      r: rand(1, 2.5),
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(124,92,252,0.5)';
      ctx.fill();
    });
    // connect nearby
    pts.forEach((a, i) => {
      pts.slice(i + 1).forEach(b => {
        const d = dist2D(a, b);
        if (d < 100) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(124,92,252,${0.15 * (1 - d / 100)})`;
          ctx.lineWidth = .5; ctx.stroke();
        }
      });
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize(); draw();
})();

// ─── Hero Canvas ─────────────────────────────────────────────
(function heroCanvas() {
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let nodes = [], edges = [], t = 0;

  function init() {
    nodes = Array.from({ length: 30 }, (_, i) => {
      const group = Math.floor(i / 8);
      const cx = [120, 370, 120, 370, 245][group] || 245;
      const cy = [100, 100, 300, 300, 200][group] || 200;
      return {
        x: cx + rand(-60, 60), y: cy + rand(-60, 60),
        vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3),
        group, r: rand(4, 8),
        pulsePhase: Math.random() * Math.PI * 2,
      };
    });
    edges = [];
    nodes.forEach((a, i) => {
      nodes.slice(i + 1).forEach((b, j) => {
        const sameGroup = a.group === b.group;
        if ((sameGroup && Math.random() < 0.6) || (!sameGroup && Math.random() < 0.05)) {
          edges.push({ a: i, b: i + 1 + j });
        }
      });
    });
  }

  function draw() {
    t += 0.01;
    ctx.clearRect(0, 0, W, H);

    // draw edges
    edges.forEach(e => {
      const a = nodes[e.a], b = nodes[e.b];
      const sameGroup = a.group === b.group;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = sameGroup
        ? `rgba(124,92,252,0.25)` : `rgba(255,255,255,0.06)`;
      ctx.lineWidth = sameGroup ? 1.5 : .5;
      ctx.stroke();
    });

    // draw nodes
    const groupColors = ['#7c5cfc','#00d4ff','#f97316','#ec4899','#22c55e'];
    nodes.forEach(n => {
      const pulse = 0.8 + 0.2 * Math.sin(t * 2 + n.pulsePhase);
      const r = n.r * pulse;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = groupColors[n.group % groupColors.length] + '22';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = groupColors[n.group % groupColors.length];
      ctx.fill();

      // update position
      n.x += n.vx; n.y += n.vy;
      if (n.x < 20 || n.x > W - 20) n.vx *= -1;
      if (n.y < 20 || n.y > H - 20) n.vy *= -1;
    });

    requestAnimationFrame(draw);
  }

  init(); draw();
})();

// ─── Graph Generation ────────────────────────────────────────
function generateGraph() {
  const n = state.nodeCount;
  const density = state.edgeDensity;
  const k = state.kClusters;
  const type = state.graphType;

  const nodes = Array.from({ length: n }, (_, i) => ({ id: i, x: 0, y: 0 }));
  const edges = new Set();
  const addEdge = (a, b) => { if (a !== b) edges.add(`${Math.min(a,b)}-${Math.max(a,b)}`); };

  if (type === 'random') {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.random() < density) addEdge(i, j);
  } else if (type === 'cluster') {
    const groups = Array.from({ length: n }, (_, i) => i % k);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const p = groups[i] === groups[j] ? density * 3.5 : density * 0.2;
        if (Math.random() < p) addEdge(i, j);
      }
  } else if (type === 'scale-free') {
    // Barabási–Albert
    const degree = new Array(n).fill(0);
    for (let i = 0; i < 3; i++) { addEdge(0, i + 1); degree[0]++; degree[i + 1]++; }
    for (let i = 4; i < n; i++) {
      const totalDeg = degree.reduce((s, d) => s + d, 0) || 1;
      const m = Math.min(3, i);
      const chosen = new Set();
      while (chosen.size < m) {
        let r = Math.random() * totalDeg, cumul = 0;
        for (let j = 0; j < i; j++) {
          cumul += degree[j];
          if (r < cumul && !chosen.has(j)) { chosen.add(j); break; }
        }
      }
      chosen.forEach(j => { addEdge(i, j); degree[i]++; degree[j]++; });
    }
  } else if (type === 'grid') {
    const cols = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      if ((i + 1) % cols !== 0 && i + 1 < n) addEdge(i, i + 1);
      if (i + cols < n) addEdge(i, i + cols);
    }
  }

  const edgeList = [...edges].map(e => {
    const [a, b] = e.split('-').map(Number);
    return { a, b };
  });

  // Layout with force-directed
  layoutForce(nodes, edgeList, 80);

  state.graph = { nodes, edges: edgeList };
  document.getElementById('node-info').textContent = `Nodes: ${n}`;
  document.getElementById('edge-info').textContent = `Edges: ${edgeList.length}`;

  // Re-render canvases
  state.results = {};
  buildCanvasGrid();
  renderAll();
}

// ─── Force-directed layout ────────────────────────────────────
function layoutForce(nodes, edges, iterations = 80) {
  const n = nodes.length;
  const W = 400, H = 340, pad = 40;
  nodes.forEach(nd => { nd.x = rand(pad, W - pad); nd.y = rand(pad, H - pad); });

  const k2 = (W * H) / (n || 1);
  const k = Math.sqrt(k2);

  for (let iter = 0; iter < iterations; iter++) {
    const temp = W * (1 - iter / iterations) * 0.5;
    const disp = nodes.map(() => ({ x: 0, y: 0 }));

    // repulsion
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d = Math.max(Math.hypot(dx, dy), 0.001);
        const f = k2 / d;
        disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f;
        disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f;
      }

    // attraction
    edges.forEach(e => {
      const dx = nodes[e.a].x - nodes[e.b].x, dy = nodes[e.a].y - nodes[e.b].y;
      const d = Math.max(Math.hypot(dx, dy), 0.001);
      const f = (d * d) / k;
      disp[e.a].x -= (dx / d) * f; disp[e.a].y -= (dy / d) * f;
      disp[e.b].x += (dx / d) * f; disp[e.b].y += (dy / d) * f;
    });

    nodes.forEach((nd, i) => {
      const d = Math.max(Math.hypot(disp[i].x, disp[i].y), 0.001);
      nd.x += (disp[i].x / d) * Math.min(d, temp);
      nd.y += (disp[i].y / d) * Math.min(d, temp);
      nd.x = Math.max(pad, Math.min(W - pad, nd.x));
      nd.y = Math.max(pad, Math.min(H - pad, nd.y));
    });
  }
}

// ─── Canvas Grid Builder ──────────────────────────────────────
function buildCanvasGrid() {
  const grid = document.getElementById('canvas-grid');
  grid.innerHTML = '';

  // Always show original first
  const origWrap = createCanvasWrap('original', 'Original Graph', '#94a3b8');
  grid.appendChild(origWrap);

  state.activeAlgos.forEach(algo => {
    const m = ALGO_META[algo];
    const wrap = createCanvasWrap(algo, m.name, m.color);
    grid.appendChild(wrap);
  });
}

function createCanvasWrap(id, name, color) {
  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';
  wrap.id = `wrap-${id}`;
  wrap.innerHTML = `
    <div class="canvas-wrap-header">
      <div class="canvas-algo-name">
        <div class="canvas-algo-dot" style="background:${color}"></div>
        ${name}
      </div>
      <span class="canvas-status" id="status-${id}">Ready</span>
    </div>
    <canvas id="canvas-${id}" width="400" height="300" style="width:100%;height:auto;"></canvas>
  `;
  return wrap;
}

// ─── Rendering ────────────────────────────────────────────────
function renderAll() {
  if (!state.graph) return;
  renderCanvas('original', null, '#94a3b8');
  state.activeAlgos.forEach(algo => {
    renderCanvas(algo, state.results[algo]?.labels, ALGO_META[algo].color);
  });
}

function renderCanvas(id, labels, defaultColor) {
  const canvas = document.getElementById(`canvas-${id}`);
  if (!canvas || !state.graph) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const { nodes, edges } = state.graph;
  ctx.clearRect(0, 0, W, H);

  // Scale nodes to canvas
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => { minX = Math.min(minX,n.x); maxX = Math.max(maxX,n.x); minY = Math.min(minY,n.y); maxY = Math.max(maxY,n.y); });
  const pad = 30;
  const scaleX = (W - 2*pad) / (maxX - minX || 1);
  const scaleY = (H - 2*pad) / (maxY - minY || 1);
  const scale = Math.min(scaleX, scaleY);
  const offX = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = (H - (maxY - minY) * scale) / 2 - minY * scale;

  const px = i => nodes[i].x * scale + offX;
  const py = i => nodes[i].y * scale + offY;

  // Edges
  edges.forEach(e => {
    const sameCluster = labels && labels[e.a] === labels[e.b] && labels[e.a] >= 0;
    ctx.beginPath();
    ctx.moveTo(px(e.a), py(e.a));
    ctx.lineTo(px(e.b), py(e.b));
    if (sameCluster) {
      ctx.strokeStyle = CLUSTER_PALETTE[labels[e.a] % CLUSTER_PALETTE.length] + '55';
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = .8;
    }
    ctx.stroke();
  });

  // Nodes
  const nRadius = Math.max(3, Math.min(7, 200 / nodes.length));
  nodes.forEach((n, i) => {
    const color = labels
      ? (labels[i] < 0 ? '#666' : CLUSTER_PALETTE[labels[i] % CLUSTER_PALETTE.length])
      : defaultColor;
    ctx.beginPath();
    ctx.arc(px(i), py(i), nRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = color + '22';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px(i), py(i), nRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

// ─── Adjacency / Graph Utils ──────────────────────────────────
function buildAdj(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  edges.forEach(e => { adj[e.a].push(e.b); adj[e.b].push(e.a); });
  return adj;
}

function buildAdjMatrix(n, edges) {
  const M = Array.from({ length: n }, () => new Float32Array(n));
  edges.forEach(e => { M[e.a][e.b] = 1; M[e.b][e.a] = 1; });
  return M;
}

function degree(adj) { return adj.map(a => a.length); }

function bfsDistances(src, adj) {
  const dist = new Int32Array(adj.length).fill(-1);
  dist[src] = 0;
  const q = [src];
  while (q.length) {
    const u = q.shift();
    adj[u].forEach(v => { if (dist[v] < 0) { dist[v] = dist[u] + 1; q.push(v); } });
  }
  return dist;
}

// ─── Algorithm: K-Means Graph ────────────────────────────────
function runKMeans(nodes, edges, k) {
  const n = nodes.length;
  const adj = buildAdj(n, edges);
  const deg = degree(adj);
  const totalEdges = edges.length;

  // Features: normalized degree + x + y position
  const features = nodes.map((nd, i) => [
    deg[i] / (Math.max(...deg) || 1),
    nd.x / 400,
    nd.y / 340,
  ]);

  let centroids = shuffle([...Array(n).keys()]).slice(0, k).map(i => features[i].slice());
  let labels = new Int32Array(n);

  for (let iter = 0; iter < 50; iter++) {
    // Assign
    let changed = false;
    features.forEach((f, i) => {
      let best = 0, bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = f.reduce((s, v, j) => s + (v - c[j]) ** 2, 0);
        if (d < bestD) { bestD = d; best = ci; }
      });
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    });
    if (!changed) break;

    // Update centroids
    centroids = Array.from({ length: k }, () => new Array(features[0].length).fill(0));
    const counts = new Array(k).fill(0);
    features.forEach((f, i) => { f.forEach((v, j) => { centroids[labels[i]][j] += v; }); counts[labels[i]]++; });
    centroids.forEach((c, ci) => {
      if (counts[ci]) c.forEach((_, j) => { c[j] /= counts[ci]; });
    });
  }

  return Array.from(labels);
}

// ─── Algorithm: Spectral Clustering (simplified) ─────────────
function runSpectral(nodes, edges, k) {
  const n = nodes.length;
  const adj = buildAdj(n, edges);
  const deg = degree(adj);

  // Normalized Laplacian eigenvectors approximated by power iteration
  // Build D^{-1/2} A D^{-1/2}
  const sqrtDeg = deg.map(d => d > 0 ? 1 / Math.sqrt(d) : 0);

  // Use k random eigenvectors via power iteration on Laplacian
  // We approximate by using the graph's structural positions
  const vectors = powerIterateEigenvectors(n, adj, sqrtDeg, k);

  // Embed nodes and run k-means on embeddings
  const features = nodes.map((_, i) => vectors.map(v => v[i]));
  return kMeansEmbedding(features, k);
}

function powerIterateEigenvectors(n, adj, sqrtDeg, k) {
  const vectors = [];
  for (let vi = 0; vi < k; vi++) {
    // Initialize random orthogonal to previous
    let v = Array.from({ length: n }, () => rand(-1, 1));

    // Orthogonalize against existing vectors (Gram-Schmidt)
    vectors.forEach(prev => {
      const dot = v.reduce((s, x, i) => s + x * prev[i], 0);
      v = v.map((x, i) => x - dot * prev[i]);
    });

    // Power iteration: v ← D^{-1/2} A D^{-1/2} v, normalized
    for (let iter = 0; iter < 20; iter++) {
      let nv = new Array(n).fill(0);
      for (let u = 0; u < n; u++) {
        adj[u].forEach(w => { nv[u] += sqrtDeg[u] * sqrtDeg[w] * v[w]; });
      }
      // Re-orthogonalize
      vectors.forEach(prev => {
        const dot = nv.reduce((s, x, i) => s + x * prev[i], 0);
        nv = nv.map((x, i) => x - dot * prev[i]);
      });
      const norm = Math.sqrt(nv.reduce((s, x) => s + x * x, 0)) || 1;
      v = nv.map(x => x / norm);
    }
    vectors.push(v);
  }
  return vectors;
}

function kMeansEmbedding(features, k) {
  const n = features.length;
  let centroids = shuffle([...Array(n).keys()]).slice(0, k).map(i => features[i].slice());
  let labels = new Int32Array(n);

  for (let iter = 0; iter < 30; iter++) {
    let changed = false;
    features.forEach((f, i) => {
      let best = 0, bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = f.reduce((s, v, j) => s + (v - c[j]) ** 2, 0);
        if (d < bestD) { bestD = d; best = ci; }
      });
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    });
    if (!changed) break;
    const dim = features[0].length;
    centroids = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    features.forEach((f, i) => { f.forEach((v, j) => { centroids[labels[i]][j] += v; }); counts[labels[i]]++; });
    centroids.forEach((c, ci) => { if (counts[ci]) c.forEach((_, j) => { c[j] /= counts[ci]; }); });
  }
  return Array.from(labels);
}

// ─── Algorithm: Louvain Method ────────────────────────────────
function runLouvain(nodes, edges) {
  const n = nodes.length;
  const adj = buildAdj(n, edges);
  const m = edges.length;
  const deg = degree(adj);

  let community = Array.from({ length: n }, (_, i) => i);
  const communityDeg = deg.slice();
  const communityIn = new Array(n).fill(0);
  const weight = new Array(n).fill(1);

  // Phase 1: local optimization
  let improved = true;
  let passes = 0;
  while (improved && passes < 20) {
    improved = false; passes++;
    const order = shuffle([...Array(n).keys()]);
    order.forEach(i => {
      const currentComm = community[i];
      // Remove i from its community
      const nb_communities = new Map();
      adj[i].forEach(j => {
        const c = community[j];
        nb_communities.set(c, (nb_communities.get(c) || 0) + 1);
      });

      // Evaluate modularity gain for each neighbor community
      let bestGain = 0, bestComm = currentComm;
      nb_communities.forEach((kIn, c) => {
        const degC = communityDeg[c] - (c === currentComm ? deg[i] : 0);
        const gain = kIn / m - deg[i] * degC / (2 * m * m);
        const selfLoss = (nb_communities.get(currentComm) || 0) / m - deg[i] * (communityDeg[currentComm] - deg[i]) / (2 * m * m);
        if (gain - selfLoss > bestGain + 1e-10) {
          bestGain = gain - selfLoss;
          bestComm = c;
        }
      });

      if (bestComm !== currentComm) {
        communityDeg[currentComm] -= deg[i];
        community[i] = bestComm;
        communityDeg[bestComm] += deg[i];
        improved = true;
      }
    });
  }

  // Renumber communities
  const map = new Map();
  let cid = 0;
  community.forEach(c => { if (!map.has(c)) map.set(c, cid++); });
  return community.map(c => map.get(c));
}

// ─── Algorithm: DBSCAN ───────────────────────────────────────
function runDBSCAN(nodes, edges) {
  const n = nodes.length;
  const adj = buildAdj(n, edges);
  const deg = degree(adj);
  const avgDeg = deg.reduce((s, d) => s + d, 0) / (n || 1);
  const minPts = Math.max(2, Math.floor(avgDeg * 0.5));
  // eps = reachability via shortest path ≤ 2
  const labels = new Int32Array(n).fill(-2); // -2 = unvisited, -1 = noise
  let clusterID = 0;

  function getNeighbors(i) {
    const nbrs = [i];
    adj[i].forEach(j => nbrs.push(j));
    return nbrs;
  }

  nodes.forEach((_, i) => {
    if (labels[i] !== -2) return;
    const nbrs = getNeighbors(i);
    if (nbrs.length < minPts) { labels[i] = -1; return; }
    labels[i] = clusterID;
    const queue = [...nbrs.filter(j => j !== i)];
    while (queue.length) {
      const j = queue.shift();
      if (labels[j] === -1) { labels[j] = clusterID; }
      if (labels[j] !== -2) continue;
      labels[j] = clusterID;
      const jNbrs = getNeighbors(j);
      if (jNbrs.length >= minPts) queue.push(...jNbrs.filter(k => labels[k] === -2));
    }
    clusterID++;
  });

  return Array.from(labels);
}

// ─── Algorithm: Girvan-Newman ─────────────────────────────────
function runGirvanNewman(nodes, edges, targetK) {
  let edgesCopy = edges.map(e => ({ ...e }));
  const n = nodes.length;

  function getComponents() {
    const adj = buildAdj(n, edgesCopy);
    const visited = new Int8Array(n);
    const labels = new Int32Array(n).fill(-1);
    let cid = 0;
    for (let s = 0; s < n; s++) {
      if (visited[s]) continue;
      const q = [s];
      visited[s] = 1; labels[s] = cid;
      while (q.length) {
        const u = q.shift();
        adj[u].forEach(v => { if (!visited[v]) { visited[v] = 1; labels[v] = cid; q.push(v); } });
      }
      cid++;
    }
    return { labels, count: cid };
  }

  function edgeBetweenness() {
    const eb = new Map();
    edgesCopy.forEach((e, i) => eb.set(i, 0));
    const adj = buildAdj(n, edgesCopy);

    for (let s = 0; s < n; s++) {
      // BFS from s
      const dist = new Int32Array(n).fill(-1);
      const sigma = new Array(n).fill(0);
      const pred = Array.from({ length: n }, () => []);
      dist[s] = 0; sigma[s] = 1;
      const q = [s];
      const order = [];
      while (q.length) {
        const u = q.shift(); order.push(u);
        adj[u].forEach(v => {
          if (dist[v] < 0) { dist[v] = dist[u] + 1; q.push(v); }
          if (dist[v] === dist[u] + 1) { sigma[v] += sigma[u]; pred[v].push(u); }
        });
      }
      // Back-propagate
      const delta = new Array(n).fill(0);
      order.reverse().forEach(u => {
        pred[u].forEach(p => {
          const pair = `${Math.min(u,p)}-${Math.max(u,p)}`;
          delta[p] += (sigma[p] / sigma[u]) * (1 + delta[u]);
        });
      });
      // Add to edge betweenness
      edgesCopy.forEach((e, i) => {
        const u = e.a, v = e.b;
        if (pred[v].includes(u) && dist[v] === dist[u] + 1) eb.set(i, eb.get(i) + delta[v]);
        if (pred[u].includes(v) && dist[u] === dist[v] + 1) eb.set(i, eb.get(i) + delta[u]);
      });
    }
    return eb;
  }

  let { count } = getComponents();
  let maxIter = Math.min(edges.length, n * 2);
  while (count < targetK && edgesCopy.length > 0 && maxIter-- > 0) {
    const eb = edgeBetweenness();
    let maxEB = -1, maxIdx = 0;
    eb.forEach((val, idx) => { if (val > maxEB) { maxEB = val; maxIdx = idx; } });
    edgesCopy.splice(maxIdx, 1);
    count = getComponents().count;
  }

  return getComponents().labels;
}

// ─── Metrics Computation ──────────────────────────────────────
function computeModularity(n, edges, labels) {
  const m = edges.length;
  if (!m) return 0;
  const adj = buildAdj(n, edges);
  const deg = degree(adj);
  let Q = 0;
  edges.forEach(e => {
    if (labels[e.a] === labels[e.b] && labels[e.a] >= 0) {
      Q += 1 - (deg[e.a] * deg[e.b]) / (2 * m);
    }
  });
  return Q / m;
}

function computeSilhouette(nodes, labels) {
  const n = nodes.length;
  const clusterSet = [...new Set(labels.filter(l => l >= 0))];
  if (clusterSet.length < 2) return 0;
  let totalS = 0, count = 0;
  nodes.forEach((nd, i) => {
    if (labels[i] < 0) return;
    const clusterNodes = nodes.filter((_, j) => labels[j] === labels[i] && j !== i);
    if (!clusterNodes.length) { count++; return; }
    const a = clusterNodes.reduce((s, o) => s + dist2D(nd, o), 0) / clusterNodes.length;
    const bPerCluster = clusterSet.filter(c => c !== labels[i]).map(c => {
      const cn = nodes.filter((_, j) => labels[j] === c);
      if (!cn.length) return Infinity;
      return cn.reduce((s, o) => s + dist2D(nd, o), 0) / cn.length;
    });
    const b = Math.min(...bPerCluster);
    totalS += (b - a) / Math.max(a, b);
    count++;
  });
  return count ? totalS / count : 0;
}

function numClusters(labels) {
  return new Set(labels.filter(l => l >= 0)).size;
}

// ─── Run Simulation ───────────────────────────────────────────
async function runSimulation() {
  if (!state.graph) { generateGraph(); await delay(100); }
  if (state.running) return;
  state.running = true;

  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-opacity=".3"/>
      <path d="M12 2a10 10 0 0110 10"/>
    </svg>
    Running...
  `;

  buildCanvasGrid();
  renderCanvas('original', null, '#94a3b8');

  const { nodes, edges } = state.graph;
  const n = nodes.length;
  const k = state.kClusters;
  const algos = [...state.activeAlgos];

  for (const algo of algos) {
    setStatus(algo, 'running');
    await delay(50 / state.speed);

    const t0 = performance.now();
    let labels;
    try {
      if (algo === 'kmeans')   labels = runKMeans(nodes, edges, k);
      if (algo === 'spectral') labels = runSpectral(nodes, edges, k);
      if (algo === 'louvain')  labels = runLouvain(nodes, edges);
      if (algo === 'dbscan')   labels = runDBSCAN(nodes, edges);
      if (algo === 'girvan')   labels = Array.from(runGirvanNewman(nodes, edges, k));
    } catch (err) {
      console.error(algo, err);
      labels = new Array(n).fill(0);
    }
    const runtime = performance.now() - t0;

    const mod = computeModularity(n, edges, labels);
    const sil = computeSilhouette(nodes, labels);
    const nc  = numClusters(labels);

    state.results[algo] = { labels, modularity: mod, silhouette: sil, runtime, numClusters: nc };
    renderCanvas(algo, labels, ALGO_META[algo].color);
    setStatus(algo, 'done', `${runtime.toFixed(0)}ms · ${nc} clusters`);

    await delay(300 / state.speed);
  }

  state.running = false;
  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
    Run All Algorithms
  `;

  renderMetrics();
}

function setStatus(algo, status, text) {
  const el = document.getElementById(`status-${algo}`);
  if (!el) return;
  el.className = `canvas-status ${status}`;
  el.textContent = text || (status === 'running' ? 'Running…' : 'Done');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Metrics Rendering ────────────────────────────────────────
function renderMetrics() {
  const placeholder = document.getElementById('metrics-content');
  const grid = document.getElementById('metrics-grid');
  const tableWrap = document.getElementById('comparison-table-wrap');

  placeholder.style.display = 'none';
  grid.style.display = 'grid';
  tableWrap.style.display = 'block';

  const algos = Object.keys(state.results);
  if (!algos.length) return;

  // Build metric cards
  const metrics = [
    {
      title: 'Modularity (Q)',
      key: 'modularity',
      format: v => v.toFixed(3),
      max: Math.max(...algos.map(a => state.results[a].modularity)),
    },
    {
      title: 'Silhouette Score',
      key: 'silhouette',
      format: v => v.toFixed(3),
      max: Math.max(...algos.map(a => state.results[a].silhouette)),
    },
    {
      title: 'Runtime (ms)',
      key: 'runtime',
      format: v => v.toFixed(1),
      max: Math.max(...algos.map(a => state.results[a].runtime)),
      lowerBetter: true,
    },
    {
      title: 'Clusters Detected',
      key: 'numClusters',
      format: v => v.toString(),
      max: Math.max(...algos.map(a => state.results[a].numClusters)),
    },
  ];

  grid.innerHTML = metrics.map(m => `
    <div class="metric-card">
      <div class="metric-card-title">${m.title}</div>
      <div class="bar-chart">
        ${algos.map(algo => {
          const val = state.results[algo][m.key];
          const pct = m.max > 0 ? (val / m.max) * 100 : 0;
          const color = ALGO_META[algo].color;
          return `
            <div class="bar-row">
              <span class="bar-label">${ALGO_META[algo].name.split(' ')[0]}</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:0%;background:${color}" data-width="${pct.toFixed(1)}"></div>
              </div>
              <span class="bar-val">${m.format(val)}</span>
            </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  // Animate bars
  requestAnimationFrame(() => {
    document.querySelectorAll('.bar-fill').forEach(el => {
      el.style.width = el.dataset.width + '%';
    });
  });

  // Build comparison table
  const bestMod = algos.reduce((b, a) => state.results[a].modularity > state.results[b].modularity ? a : b, algos[0]);
  const bestSil = algos.reduce((b, a) => state.results[a].silhouette > state.results[b].silhouette ? a : b, algos[0]);
  const fastestRT = algos.reduce((b, a) => state.results[a].runtime < state.results[b].runtime ? a : b, algos[0]);

  const table = document.getElementById('compare-table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Algorithm</th>
        <th>Modularity (Q)</th>
        <th>Silhouette</th>
        <th>Runtime (ms)</th>
        <th>Clusters</th>
        <th>Noise Nodes</th>
      </tr>
    </thead>
    <tbody>
      ${algos.map(algo => {
        const r = state.results[algo];
        const noise = r.labels.filter(l => l < 0).length;
        return `<tr>
          <td>
            <span style="display:inline-flex;align-items:center;gap:.5rem;">
              <span style="width:8px;height:8px;border-radius:50%;background:${ALGO_META[algo].color};display:inline-block;"></span>
              ${ALGO_META[algo].name}
            </span>
          </td>
          <td>${r.modularity.toFixed(4)}${algo === bestMod ? '<span class="badge-best">BEST</span>' : ''}</td>
          <td>${r.silhouette.toFixed(4)}${algo === bestSil ? '<span class="badge-best">BEST</span>' : ''}</td>
          <td>${r.runtime.toFixed(1)}${algo === fastestRT ? '<span class="badge-best">FASTEST</span>' : ''}</td>
          <td>${r.numClusters}</td>
          <td>${noise}</td>
        </tr>`;
      }).join('')}
    </tbody>
  `;

  document.getElementById('metrics').scrollIntoView({ behavior: 'smooth' });
}

// ─── Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Sync slider displays
  updateSliderVal('node-count',   'node-count-val');
  updateSliderVal('edge-density', 'edge-density-val', 0.01);
  updateSliderVal('k-clusters',   'k-clusters-val');

  generateGraph();
});
