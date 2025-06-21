/**************************************************
 *  Trade Desk Pro  –  script.js                  *
 *  - eixo de tempo HH:MM                         *
 *  - stream dual  (kline_1m + trade)             *
 *  - price-line live                             *
 *  - marcadores de sinais (SMA cross)            *
 **************************************************/

// elementos
const chartEl   = document.getElementById('chart');
const panelEl   = document.getElementById('signalPanel');
const closeBtn  = document.querySelector('.close-signals');
const tableBody = document.getElementById('signalTableBody');
const priceBadge = document.getElementById('priceBadge');
const changeBadge= document.getElementById('changeBadge');
const banner    = document.getElementById('eventBanner');
const fibBtn    = document.getElementById('fibBtn');
const trendBtn  = document.getElementById('trendBtn');
const zoomBtn   = document.getElementById('zoomBtn');
const indBtn    = document.getElementById('indBtn');
const toggleSig = document.getElementById('toggleSignals');
const pairSel   = document.getElementById('pairSelect');
const intSel    = document.getElementById('intervalSelect');
const typeSel   = document.getElementById('typeSelect');

// estado
let chart, candleSeries, smaSeries, tradeSeries, priceLine,
    wsCandle, wsTrade,
    candles = [], markers = [],
    smaQ = [], smaP = 14,
    lastPrice = null, lastAbove = null,
    zoomed = false, indVisible = true,
    fibLines = [], trendSeries = null;
    /* ==== helpers RSI & MACD (technicalindicators) ==== */
function getRSI(src) {
  const r = ti.rsi({ values: src.map(c => c.close), period: 14 });
  return r.length ? r[r.length - 1] : 50;
}
function getMACDHist(src) {
  const m = ti.macd({
    values: src.map(c => c.close),
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  return m.length ? m[m.length - 1].histogram : 0;
}


/* ---------- init ---------- */
toggleSig.addEventListener('click', ()=> panelEl.classList.toggle('collapsed'));
closeBtn .addEventListener('click', ()=> panelEl.classList.add('collapsed'));
[fibBtn, trendBtn, zoomBtn, indBtn].forEach(btn => btn.style.pointerEvents='auto');

fibBtn  .onclick = toggleFib;
trendBtn.onclick = toggleTrend;
zoomBtn .onclick = toggleZoom;
indBtn  .onclick = ()=>{indVisible=!indVisible; smaSeries.applyOptions({visible:indVisible});};

[pairSel,intSel,typeSel].forEach(sel=>sel.addEventListener('change', reload));

initChart(); loadData();

/* ---------- chart --------- */
function initChart(){
  chartEl.innerHTML='';
  chart = LightweightCharts.createChart(chartEl,{
    layout:{background:{color:'#0e1217'},textColor:'#d1d5db'},
    grid:{vertLines:{color:'#2c313a'},horzLines:{color:'#2c313a'}},
    timeScale:{
      timeVisible:true,secondsVisible:true,
      /* formata HH:MM sempre */
      localization:{timeFormatter:t=>{
        const d=new Date(t*1000);
        return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      }}
    }
  });

  candleSeries = chart.addCandlestickSeries();
  smaSeries    = chart.addLineSeries({color:'#22c55e',lineWidth:2});
  priceLine    = candleSeries.createPriceLine({price:0,color:'#22c55e',lineWidth:2});
}

/* ---------- data ---------- */
async function loadData(){
  const pair=pairSel.value.toUpperCase(), int=intSel.value;
  bannerMsg(`Carregando ${pair}…`,true);

  // histórico
  const hist= await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${int}&limit=200`)
                     .then(r=>r.json());
  candles = hist.map(k=>({time:k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));
  candleSeries.setData(candles);
  smaSeries.setData(calcSMA(candles));

  // tipo
  applyType();

  // abre websockets
  openSockets(pair,int);
}

function reload(){
  closeSockets();
  initChart();
  loadData();
}

/* ---------- sockets --------- */
function openSockets(sym,int){
  // vela 1m
  wsCandle = new WebSocket(`wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${int}`);
  wsCandle.onmessage = e=>{
    const k=JSON.parse(e.data).k;
    const c={time:k.t/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c};
    candleSeries.update(c);
    priceLine.applyOptions({price:c.close,title:c.close.toFixed(2)});
    updateLive(c.close);
    if(k.x){ // candle fechado: add a amostra → SMA & signals
      candles.push(c); if(candles.length>200)candles.shift();
      smaSeries.update({time:c.time,value:calcNextSMA(c.close,true)});
      checkSignal(c);
    } else { // parcial -> calcula sma incremental
      smaSeries.update({time:c.time,value:calcNextSMA(c.close,false)});
      checkSignal(c);
    }
    chart.timeScale().scrollToRealTime();
  };

  // trades (tick)
  wsTrade = new WebSocket(`wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@trade`);
  wsTrade.onmessage = e=>{
    const t=JSON.parse(e.data);
    updateLive(+t.p);
  };
}

function closeSockets(){
  wsCandle?.close(); wsTrade?.close();
}

/* ---------- helpers ---------- */
function applyType(){
  const v=typeSel.value;
  candleSeries.applyOptions({visible:v==='candle'});
}

typeSel.addEventListener('change',applyType);

function calcSMA(arr){
  return arr.map((d,i)=>{
    if(i<smaP-1)return null;
    const avg=arr.slice(i-smaP+1,i+1).reduce((s,x)=>s+x.close,0)/smaP;
    return {time:d.time,value:avg};
  }).filter(Boolean);
}
function calcNextSMA(price,closed){
  if(closed){smaQ.push(price);}else{ /* substitui último */ smaQ[smaQ.length-1]=price; }
  if(smaQ.length>smaP)smaQ.shift();
  return smaQ.reduce((s,x)=>s+x,0)/smaQ.length;
}

function updateLive(price){
  priceBadge.textContent=price.toLocaleString('en-US',{minimumFractionDigits:2});
  if(lastPrice){
    const pct=((price-lastPrice)/lastPrice*100).toFixed(2);
    changeBadge.textContent=`${pct}%`;
    changeBadge.classList.toggle('negative',pct<0);
  }
  lastPrice=price;
}

function bannerMsg(msg,pos=true){
  banner.textContent=msg;
  banner.style.background=pos?'#22c55e':'#ef4444';
  banner.classList.add('show');
  setTimeout(()=>banner.classList.remove('show'),3000);
}
if (k.x) {                // vela fechou
  askAI(c);               // <<< chama IA
}


/* ---------- sinais ---------- */
function checkSignal(c){
  if(!smaQ.length) return;
  const smaVal=smaQ[smaQ.length-1];
  const above=c.close>smaVal;
  if(lastAbove===null){lastAbove=above;return;}
  if(above!==lastAbove){
    const type=above?'BUY':'SELL';
    addSignal(c.time,type,c.close);
    bannerMsg(`SINAL ${type}`,above);
  }
  lastAbove=above;
}
function addSignal(time,type,price){
  // marcador no gráfico
  markers.push({
    time, position: type==='BUY'?'belowBar':'aboveBar',
    color: type==='BUY'?'#22c55e':'#ef4444',
    shape: type==='BUY'?'arrowUp':'arrowDown',
    text:  `${type} ${price.toFixed(2)}`
  });
  candleSeries.setMarkers(markers.slice(-100));

  // tabela
  const row=`<tr><td>${new Date(time*1000).toLocaleTimeString('pt-BR')}</td>
  <td>${pairSel.value.toUpperCase()}</td><td>${intSel.value}</td>
  <td class="${type==='BUY'?'buy':'sell'}">${type}</td><td>${price.toFixed(2)}</td></tr>`;
  tableBody.insertAdjacentHTML('afterbegin',row);
  if(tableBody.rows.length>60)tableBody.deleteRow(-1);
}
/* ---------- consulta IA ---------- */
async function askAI(c) {
  const payload = {
    symbol:   pairSel.value.toUpperCase(),
    interval: intSel.value,
    price:    c.close,
    sma:      smaQ[smaQ.length - 1],
    rsi:      getRSI(candles),
    macdHist: getMACDHist(candles)
  };

  try {
    const res = await fetch('/.netlify/functions/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const sig = await res.json();             // {action,confidence,comment}

    if (sig.action !== 'WAIT') {
      addSignal(c.time, sig.action, c.close);                     // tabela + marker
      bannerMsg(`${sig.action} (${Math.round(sig.confidence*100)}%) – ${sig.comment}`,
                sig.action === 'BUY');
      console.log('IA sinal', sig);
    }
  } catch (e) {
    console.error('Erro IA', e);
  }
}


/* ---------- botões laterais ---------- */
function toggleFib(){
  if(fibLines.length){
    fibLines.forEach(l=>candleSeries.removePriceLine(l));fibLines=[];
  }else{
    const highs=candles.map(c=>c.high),lows=candles.map(c=>c.low);
    const hi=Math.max(...highs),lo=Math.min(...lows);
    [0.236,0.382,0.5,0.618,0.786].forEach(r=>{
      fibLines.push(candleSeries.createPriceLine({
        price:lo+(hi-lo)*r,color:'rgba(255,165,0,.8)',
        lineStyle:LightweightCharts.LineStyle.Dashed,axisLabelVisible:true,
        title:`${(r*100).toFixed(1)}%`
      }));
    });
  }
}
function toggleTrend(){
  if(trendSeries){chart.removeSeries(trendSeries);trendSeries=null;return;}
  const f=candles[0],l=candles[candles.length-1];
  trendSeries=chart.addLineSeries({color:'rgba(0,123,255,.8)',lineStyle:2,lineWidth:2});
  trendSeries.setData([{time:f.time,value:f.close},{time:l.time,value:l.close}]);
}
function toggleZoom(){
  if(!zoomed){const len=candles.length;chart.timeScale().setVisibleLogicalRange({from:len-60,to:len});}
  else{chart.timeScale().fitContent();}
  zoomed=!zoomed;
}
