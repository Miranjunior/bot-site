/* ===== DOM ===== */
const chartDiv = document.getElementById('chart');
const pairSel  = document.getElementById('pairSelect');
const intSel   = document.getElementById('intervalSelect');
const typeSel  = document.getElementById('typeSelect');
const fullBtn  = document.getElementById('fullscreenBtn');
const banner   = document.getElementById('signalBanner');
const tableBody= document.getElementById('signalTableBody');

/* ===== VARS ===== */
let chart, priceSeries, smaSeries, ws, closes=[], lastSMA=null, lastAbove=null;

/* ===== INIT ===== */
createChart();  loadData();
pairSel.onchange = loadData;
intSel.onchange  = loadData;
typeSel.onchange = ()=>{ rebuildSeries(); loadData(); };
fullBtn.onclick  = ()=>document.documentElement.requestFullscreen();

/* ===== BANNER ===== */
function showBanner(msg,bg){ banner.textContent=msg; banner.style.background=bg; banner.classList.add('show'); }
function hideBanner(){ banner.classList.remove('show'); }

/* ===== CHART ===== */
function createChart(){
  chart = LightweightCharts.createChart(chartDiv,{
    layout:{background:{color:'#0d1117'},textColor:'#e6edf3'},
    grid:{vertLines:{color:'#2c313c'},horzLines:{color:'#2c313c'}},
    rightPriceScale:{visible:true},
    crosshair:{mode:0},
    timeScale:{timeVisible:true,secondsVisible:false},
  });
  rebuildSeries();
}
function rebuildSeries(){
  if(priceSeries) chart.removeSeries(priceSeries);
  if(smaSeries)   chart.removeSeries(smaSeries);

  const t=typeSel.value;
  priceSeries =
    t==='candle'?chart.addCandlestickSeries():
    t==='line'  ?chart.addLineSeries({color:'#1e90ff',lineWidth:2}):
    chart.addAreaSeries({topColor:'#1e90ff88',bottomColor:'#1e90ff22',lineColor:'#1e90ff',lineWidth:2});

  smaSeries = chart.addLineSeries({color:'#fbbf24',lineWidth:1});
}

/* ===== DATA ===== */
async function loadData(){
  /* reset */
  if(ws) ws.close();
  closes=[]; lastSMA=null; lastAbove=null; tableBody.innerHTML='';
  priceSeries.setData([]); smaSeries.setData([]);
  showBanner('Aguardando dados…','#555');

  const pair = pairSel.value, interval=intSel.value;
  /* histórico */
  const url=`https://api.binance.com/api/v3/klines?symbol=${pair.toUpperCase()}&interval=${interval}&limit=500`;
  const kl = await fetch(url).then(r=>r.json());
  const hist=kl.map(k=>({time:k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));
  priceSeries.setData(hist);
  hist.forEach(p=>{ pushClose(p.close); drawSMA(p.time); });

  /* countdown até fechamento da próxima vela */
  startCountdown(interval);

  /* WebSocket */
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@kline_${interval}`);
  ws.onopen   = ()=>showBanner('Conectado — aguardando sinal','#444');
  ws.onclose  = ()=>showBanner('Desconectado','#e11d48');
  ws.onmessage=e=>{
    const k=JSON.parse(e.data).k;
    const p={time:k.t/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c};
    priceSeries.update(p);
    if(k.x){ pushClose(p.close); drawSMA(p.time); checkSignal(p); }
  };
}

/* ===== CONTAGEM REGRESSIVA ===== */
let timerId=null;
function startCountdown(interval){
  if(timerId) clearInterval(timerId);
  const secMap={'1m':60,'5m':300,'15m':900};
  timerId=setInterval(()=>{
    const now=Date.now();
    const next = Math.ceil(now/(secMap[intSel.value]*1000))*secMap[intSel.value]*1000;
    const rem  = Math.max(0,Math.floor((next-now)/1000));
    banner.textContent = `Aguardando sinal (${rem}s)`;
  },1000);
}

/* ===== SMA & SINAL ===== */
function pushClose(c){ closes.push(c); if(closes.length>20) closes.shift(); }
function drawSMA(t){ if(closes.length<20) return;
  lastSMA = closes.reduce((a,b)=>a+b,0)/closes.length;
  smaSeries.update({time:t,value:lastSMA});
}
function checkSignal(p){
  if(lastSMA===null) return;
  const above = p.close>lastSMA;
  if(lastAbove===null){ lastAbove=above; return; }

  if(above!==lastAbove){
    const type=above?'BUY':'SELL';
    addMarker(p.time,type); logTable(p.time,type,p.close);
    showBanner(`SINAL: ${type}`, above?'#22c55e':'#ef4444');
    setTimeout(()=>hideBanner(),4000);      // some após 4 s
  }
  lastAbove=above;
}

/* ===== MARCADORES & TABELA ===== */
function addMarker(t,type){
  priceSeries.setMarkers([{time:t,position:type==='BUY'?'belowBar':'aboveBar',
    color:type==='BUY'?'#22c55e':'#ef4444',shape:'arrowUp',size:2,text:type}]);
}
function logTable(t,type,price){
  const row=`<tr>
   <td>${new Date(t*1000).toLocaleTimeString('pt-BR')}</td>
   <td>${pairSel.value.toUpperCase()}</td>
   <td>${intSel.value}</td>
   <td class="${type==='BUY'?'buy':'sell'}">${type}</td>
   <td>${price.toFixed(2)}</td></tr>`;
  tableBody.insertAdjacentHTML('afterbegin',row);
  if(tableBody.rows.length>50) tableBody.deleteRow(-1);
}

/* ===== SONORIZAÇÃO opcional ===== */
/* (mantive simples: beep já existe no alert se quiser) */
