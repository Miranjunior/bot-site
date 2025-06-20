// ───────── ELEMENTOS ─────────
const chartEl      = document.getElementById('chart');
const signalPanel  = document.getElementById('signalPanel');
const closeSigBtn  = document.querySelector('.close-signals');
const tableBody    = document.getElementById('signalTableBody');
const priceBadge   = document.getElementById('priceBadge');
const changeBadge  = document.getElementById('changeBadge');
const bannerEl     = document.getElementById('eventBanner');
const fibBtn       = document.getElementById('fibBtn');
const trendBtn     = document.getElementById('trendBtn');
const zoomBtn      = document.getElementById('zoomBtn');
const indBtn       = document.getElementById('indBtn');
const toggleSigBtn = document.getElementById('toggleSignals');
const pairSel      = document.getElementById('pairSelect');
const intSel       = document.getElementById('intervalSelect');
const typeSel      = document.getElementById('typeSelect');

// ───────── ESTADO ─────────
let chart, candleSeries, lineSeries, areaSeries, smaSeries, priceLine, ws;
let candlesData = [], fibLines = [], trendSeries = null;
let zoomed = false, indicatorsVisible = true;
let lastSMA = null, lastAbove = null, lastPrice = null;
let smaQueue = [], smaPeriod = 14;

// ───────── INICIALIZAÇÃO ─────────
toggleSigBtn.addEventListener('click', ()=> signalPanel.classList.toggle('collapsed'));
closeSigBtn .addEventListener('click', ()=> signalPanel.classList.add('collapsed'));
fibBtn      .addEventListener('click', toggleFibonacci);
trendBtn    .addEventListener('click', toggleTrendLine);
zoomBtn     .addEventListener('click', toggleZoom);
indBtn      .addEventListener('click', toggleIndicators);

[pairSel, intSel, typeSel].forEach(el=>{
  el.addEventListener('change', ()=>{
    showBanner(`Ativo: ${pairSel.value.toUpperCase()}`, true);
    reloadChart();
  });
});

initChart();
loadData();

// ───────── INICIALIZAÇÃO DO CHART ─────────
function initChart(){
  chartEl.innerHTML = '';
  chart = LightweightCharts.createChart(chartEl, {
    layout: { background: { color: '#0e1217' }, textColor: '#D1D5DB' },
    grid:   { vertLines: { color: '#2c313a' }, horzLines: { color: '#2c313a' } },
    timeScale: {
      timeVisible: true,
      secondsVisible: true,
      rightOffset: 0,
      rightBarStaysOnScroll: true
    },
  });
  candleSeries = chart.addCandlestickSeries();
  lineSeries   = chart.addLineSeries({ visible: false });
  areaSeries   = chart.addAreaSeries({ visible: false });
  smaSeries    = chart.addLineSeries({ color: '#22c55e', lineWidth: 2 });

  // linha de preço atual
  priceLine = candleSeries.createPriceLine({
    price: 0,
    color: 'var(--accent)',
    lineWidth: 2,
    axisLabelVisible: true,
    title: ''
  });
}

// ───────── RELOAD ─────────
function reloadChart(){
  if(ws){ ws.close(); ws=null; }
  initChart();
  loadData();
}

// ───────── HISTÓRICO + WS ─────────
async function loadData(){
  const pair = pairSel.value.toUpperCase(), inter = intSel.value;
  showBanner(`Analisando ${pair}...`, true);

  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${inter}&limit=200`;
  const raw = await fetch(url).then(r=>r.json());
  candlesData = raw.map(k=>({
    time: k[0]/1000,
    open:+k[1], high:+k[2], low:+k[3], close:+k[4]
  }));

  candleSeries.setData(candlesData);
  lineSeries  .setData(candlesData.map(c=>({ time:c.time, value:c.close })));
  areaSeries  .setData(candlesData.map(c=>({ time:c.time, value:c.close })));
  smaSeries   .setData(calcSMA(candlesData, smaPeriod));
  applyChartType();

  // scroll to real time
  chart.timeScale().scrollToRealTime();

  connectWS(pair, inter);
}

// ───────── WS REAL-TIME ─────────
function connectWS(pair, inter){
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@kline_${inter}`);
  ws.onmessage = e => {
    const k = JSON.parse(e.data).k;
    const c = { time:k.t/1000, open:+k.o, high:+k.h, low:+k.l, close:+k.c };

    // atualiza candles e séries
    candleSeries.update(c);
    lineSeries.update({ time:c.time, value:c.close });
    areaSeries.update({ time:c.time, value:c.close });

    // SMA incremental
    smaSeries.update(lastSMA = { time:c.time, value:calcNextSMA(c.close) });

    // atualiza priceLine
    priceLine.applyOptions({ price: c.close, title: c.close.toFixed(2) });

    // badges e sinais
    updateBadges(c.close);
    checkSignal(c);

    // mantém eixo no “agora”
    chart.timeScale().scrollToRealTime();
  };
}

// ───────── APLICA TIPO GRÁFICO ─────────
function applyChartType(){
  candleSeries.applyOptions({ visible:typeSel.value==='candle' });
  lineSeries  .applyOptions({ visible:typeSel.value==='line'   });
  areaSeries  .applyOptions({ visible:typeSel.value==='area'   });
}
typeSel.addEventListener('change', applyChartType);

// ───────── INDICADORES (SMA) ─────────
function calcSMA(data,p){
  return data.map((d,i)=>{
    if(i<p-1) return null;
    const slice = data.slice(i-p+1, i+1);
    const avg   = slice.reduce((s,x)=>s+x.close,0)/p;
    return { time:d.time, value:avg };
  }).filter(Boolean);
}
function calcNextSMA(val){
  smaQueue.push(val);
  if(smaQueue.length> smaPeriod) smaQueue.shift();
  return smaQueue.reduce((s,x)=>s+x,0)/smaQueue.length;
}

// ───────── BADGES ─────────
function updateBadges(price){
  priceBadge.textContent = price.toLocaleString('en-US',{ minimumFractionDigits:2 });
  if(lastPrice!==null){
    const pct = ((price-lastPrice)/lastPrice*100).toFixed(2);
    changeBadge.textContent = `${pct}%`;
    changeBadge.classList.toggle('negative', pct<0);
  }
  lastPrice = price;
}

// ───────── SINAIS ─────────
function checkSignal(c){
  if(!lastSMA) return;
  const above = c.close> lastSMA.value;
  if(lastAbove===null){ lastAbove=above; return; }
  if(above!== lastAbove){
    const type = above?'BUY':'SELL';
    addSignalRow(c.time, type, c.close);
    showBanner(`SINAL ${type}`, above);
  }
  lastAbove = above;
}
function addSignalRow(t,type,price){
  const row = `
    <tr>
      <td>${new Date(t*1000).toLocaleTimeString('pt-BR')}</td>
      <td>${pairSel.value.toUpperCase()}</td>
      <td>${intSel.value}</td>
      <td class="${type==='BUY'?'buy':'sell'}">${type}</td>
      <td>${price.toFixed(2)}</td>
      <td>${intSel.value}</td>
    </tr>`;
  tableBody.insertAdjacentHTML('afterbegin', row);
  if(tableBody.rows.length>50) tableBody.deleteRow(-1);
}

// ───────── BANNER ─────────
function showBanner(txt,good=true){
  bannerEl.textContent = txt;
  bannerEl.style.background = good?'var(--accent)':'var(--danger)';
  bannerEl.classList.add('show');
  setTimeout(()=>bannerEl.classList.remove('show'),3000);
}

// ───────── BOTÕES LATERAIS ─────────

// Fibonacci
function toggleFibonacci(){
  if(fibLines.length){
    fibLines.forEach(l=>candleSeries.removePriceLine(l));
    fibLines=[];
    return;
  }
  const highs = candlesData.map(c=>c.high), lows = candlesData.map(c=>c.low);
  const high = Math.max(...highs), low = Math.min(...lows);
  [0.236,0.382,0.618,0.786].forEach(r=>{
    fibLines.push(candleSeries.createPriceLine({
      price: low+(high-low)*r,
      color: 'rgba(255,165,0,0.8)',
      lineStyle:LightweightCharts.LineStyle.Dashed,
      axisLabelVisible:true,
      title:`${(r*100).toFixed(1)}%`
    }));
  });
}

// Linha de tendência
function toggleTrendLine(){
  if(trendSeries){
    chart.removeSeries(trendSeries);
    trendSeries=null;
  } else {
    const f=candlesData[0], l=candlesData[candlesData.length-1];
    trendSeries=chart.addLineSeries({
      color:'rgba(0,123,255,0.8)',
      lineStyle:LightweightCharts.LineStyle.Dotted,
      lineWidth:2
    });
    trendSeries.setData([
      {time:f.time,value:f.close},
      {time:l.time,value:l.close}
    ]);
  }
}

// Zoom
function toggleZoom(){
  if(!zoomed){
    const len=candlesData.length;
    const from=candlesData[Math.max(0,len-50)].time;
    const to  =candlesData[len-1].time;
    chart.timeScale().setVisibleRange({from,to});
  } else {
    chart.timeScale().fitContent();
  }
  zoomed=!zoomed;
}

// Indicadores
function toggleIndicators(){
  indicatorsVisible=!indicatorsVisible;
  smaSeries.applyOptions({visible:indicatorsVisible});
}
