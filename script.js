// ───────── ELEMENTOS ─────────
const chartEl       = document.getElementById('chart');
const panelEl       = document.getElementById('signalPanel');
const tableBody     = document.getElementById('signalTableBody');
const priceBadge    = document.getElementById('priceBadge');
const changeBadge   = document.getElementById('changeBadge');
const bannerEl      = document.getElementById('eventBanner');
const fibBtn        = document.getElementById('fibBtn');
const trendBtn      = document.getElementById('trendBtn');
const zoomBtn       = document.getElementById('zoomBtn');
const indBtn        = document.getElementById('indBtn');
const toggleSigBtn  = document.getElementById('toggleSignals');
const pairSel       = document.getElementById('pairSelect');
const intSel        = document.getElementById('intervalSelect');
const typeSel       = document.getElementById('typeSelect');

// ───────── ESTADO GLOBAL ─────────
let chart, candleSeries, lineSeries, areaSeries, smaSeries;
let ws;
let candlesData = [];
let fibLines = [];
let trendSeries = null;
let zoomed = false;
let indicatorsVisible = true;
let lastSMA = null, lastAbove = null, lastPrice = null;
let smaQueue = [], smaPeriod = 14;

// ───────── INICIALIZAÇÃO ─────────
toggleSigBtn.addEventListener('click', ()=> panelEl.classList.toggle('collapsed'));
fibBtn       .addEventListener('click', toggleFibonacci);
trendBtn     .addEventListener('click', toggleTrendLine);
zoomBtn      .addEventListener('click', toggleZoom);
indBtn       .addEventListener('click', toggleIndicators);
[pairSel,intSel,typeSel].forEach(el=>{
  el.addEventListener('change', ()=>{
    showBanner(`Ativo: ${pairSel.value.toUpperCase()}`, true);
    reloadChart();
  });
});

initChart();
loadData();
setInterval(()=>{ /* garante repaint se algo falhar */ chart.timeScale().applyOptions({ rightOffset: 1 }); }, 1000);

// ───────── FUNÇÕES PRINCIPAIS ─────────
function initChart(){
  chartEl.innerHTML = '';
  chart = LightweightCharts.createChart(chartEl, {
    layout: { background: { color: '#0e1217' }, textColor: '#D1D5DB' },
    grid:   { vertLines: { color: '#2c313a' }, horzLines: { color: '#2c313a' } },
    timeScale: { timeVisible: true, secondsVisible: true },
  });
  candleSeries = chart.addCandlestickSeries();
  lineSeries   = chart.addLineSeries({ visible: false });
  areaSeries   = chart.addAreaSeries({ visible: false });
  smaSeries    = chart.addLineSeries({ color: '#22c55e', lineWidth: 2 });
}

function reloadChart(){
  if(ws){ ws.close(); ws = null; }
  initChart();
  loadData();
}

// ───────── CARREGA HISTÓRICO + WS ─────────
async function loadData(){
  const pair = pairSel.value.toUpperCase(), inter = intSel.value;
  showBanner(`Analisando ${pair}...`, true);

  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${inter}&limit=200`;
  const raw = await fetch(url).then(r => r.json());
  candlesData = raw.map(k => ({
    time:  k[0]/1000,
    open:  +k[1],
    high:  +k[2],
    low:   +k[3],
    close: +k[4],
  }));

  // desenha histórico
  candleSeries.setData(candlesData);
  lineSeries  .setData(candlesData.map(c=>({ time: c.time, value: c.close })));
  areaSeries  .setData(candlesData.map(c=>({ time: c.time, value: c.close })));
  smaSeries   .setData(calcSMA(candlesData, smaPeriod));

  // força tipo de gráfico
  applyChartType();

  // abre WS em tempo real
  connectWS(pair, inter);
}

// ───────── WEBSOCKET REAL-TIME ─────────
function connectWS(pair, inter){
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@kline_${inter}`);
  ws.onmessage = e => {
    const k = JSON.parse(e.data).k;
    // atualiza a cada tick (não somente candle fechado)
    const c = {
      time: k.t/1000,
      open: +k.o,
      high: +k.h,
      low:  +k.l,
      close:+k.c,
    };
    candleSeries.update(c);
    lineSeries.update({ time: c.time, value: c.close });
    areaSeries.update({ time: c.time, value: c.close });

    // SMA incremental
    smaSeries.update( lastSMA = { time: c.time, value: calcNextSMA(c.close) });

    // badges e sinal
    updateBadges(c.close);
    checkSignal(c);
  };
}

// ───────── APLICA TIPO DE GRÁFICO ─────────
function applyChartType(){
  candleSeries.applyOptions({ visible: typeSel.value==='candle' });
  lineSeries  .applyOptions({ visible: typeSel.value==='line'   });
  areaSeries  .applyOptions({ visible: typeSel.value==='area'   });
}
typeSel.addEventListener('change', applyChartType);

// ───────── CÁLCULO DE INDICADORES ─────────
function calcSMA(data, period){
  return data.map((d,i)=>{
    if(i < period-1) return null;
    const slice = data.slice(i-period+1, i+1);
    const avg = slice.reduce((s,x)=>s+x.close,0) / period;
    return { time: d.time, value: avg };
  }).filter(Boolean);
}

function calcNextSMA(price){
  smaQueue.push(price);
  if(smaQueue.length > smaPeriod) smaQueue.shift();
  return smaQueue.reduce((s,x)=>s+x,0) / smaQueue.length;
}

// ───────── BADGES DE PREÇO ─────────
function updateBadges(price){
  priceBadge.textContent = price.toLocaleString('en-US', { minimumFractionDigits:2 });
  if(lastPrice !== null){
    const pct = ((price - lastPrice) / lastPrice * 100).toFixed(2);
    changeBadge.textContent = `${pct}%`;
    changeBadge.classList.toggle('negative', pct < 0);
  }
  lastPrice = price;
}

// ───────── SINAIS DE COMPRA/VENDA ─────────
function checkSignal(c){
  if(!lastSMA) return;
  const above = c.close > lastSMA.value;
  if(lastAbove === null){ lastAbove = above; return; }
  if(above !== lastAbove){
    const type = above ? 'BUY' : 'SELL';
    addSignalRow(c.time, type, c.close);
    showBanner(`SINAL ${type}`, above);
  }
  lastAbove = above;
}

function addSignalRow(time, type, price){
  const row = `
    <tr>
      <td>${new Date(time*1000).toLocaleTimeString('pt-BR')}</td>
      <td>${pairSel.value.toUpperCase()}</td>
      <td>${intSel.value}</td>
      <td class="${type==='BUY'?'buy':'sell'}">${type}</td>
      <td>${price.toFixed(2)}</td>
      <td>${intSel.value}</td>
    </tr>`;
  tableBody.insertAdjacentHTML('afterbegin', row);
  if(tableBody.rows.length > 50) tableBody.deleteRow(-1);
}

// ───────── BANNER DE NOTIFICAÇÕES ─────────
function showBanner(text, positive=true){
  bannerEl.textContent = text;
  bannerEl.style.background = positive ? 'var(--accent)' : 'var(--danger)';
  bannerEl.classList.add('show');
  setTimeout(()=> bannerEl.classList.remove('show'), 3000);
}

// ───────── FUNÇÕES DOS BOTÕES LATERAIS ─────────

// Fibonacci: linhas de retração
function toggleFibonacci(){
  if(fibLines.length){
    fibLines.forEach(line => candleSeries.removePriceLine(line));
    fibLines = [];
    return;
  }
  const prices = candlesData.map(c=>[c.high, c.low]).flat();
  const high = Math.max(...prices), low = Math.min(...prices);
  [0.236,0.382,0.618,0.786].forEach(r=>{
    fibLines.push(
      candleSeries.createPriceLine({
        price: low + (high-low)*r,
        color: 'rgba(255,165,0,0.8)',
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Fib ${r*100}%`
      })
    );
  });
}

// Linha de tendência: primeira→última vela
function toggleTrendLine(){
  if(trendSeries){
    chart.removeSeries(trendSeries);
    trendSeries = null;
    return;
  }
  const first = candlesData[0], last = candlesData[candlesData.length-1];
  trendSeries = chart.addLineSeries({
    color: 'rgba(0,123,255,0.8)',
    lineStyle: LightweightCharts.LineStyle.Dotted,
    lineWidth: 2
  });
  trendSeries.setData([
    { time: first.time, value: first.close },
    { time: last.time,  value: last.close }
  ]);
}

// Zoom: mostra só últimas 50 velas ou full
function toggleZoom(){
  if(!zoomed){
    const len = candlesData.length;
    const from = candlesData[Math.max(0,len-50)].time;
    const to   = candlesData[len-1].time;
    chart.timeScale().setVisibleRange({ from, to });
  } else {
    chart.timeScale().fitContent();
  }
  zoomed = !zoomed;
}

// Indicadores: só SMA por hora
function toggleIndicators(){
  indicatorsVisible = !indicatorsVisible;
  smaSeries.applyOptions({ visible: indicatorsVisible });
}
