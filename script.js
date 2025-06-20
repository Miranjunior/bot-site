/* ===== CONFIG ===== */
const CHART_LIMIT = 500;
const chartDiv = document.getElementById('chart');
const pairSel  = document.getElementById('pairSelect');
const intSel   = document.getElementById('intervalSelect');
const typeSel  = document.getElementById('typeSelect');
const fullBtn  = document.getElementById('fullscreenBtn');
const tableBody= document.getElementById('signalTableBody');

const BOT_TOKEN=''; const CHAT_ID='';      // opcional Telegram

/* ===== STATE ===== */
let chart, series, smaSeries, ws, closes=[];
let lastAbove=null, sigArr=[];

/* ===== INIT ===== */
createChart();
loadData();

pairSel.onchange   = ()=>loadData();
intSel.onchange    = ()=>loadData();
typeSel.onchange   = ()=>{ rebuildSeries(); };
fullBtn.onclick    = ()=>document.documentElement.requestFullscreen();

/* ===== FUNÇÕES PRINCIPAIS ===== */
function createChart(){
  chart=LightweightCharts.createChart(chartDiv,{
    layout:{background:{color:'var(--bg)'},textColor:'var(--text)'},
    grid:{vertLines:{color:'#2c313c'},horzLines:{color:'#2c313c'}},
    crosshair:{mode:0},
    rightPriceScale:{visible:true},
    timeScale:{timeVisible:true,secondsVisible:false},
  });
  rebuildSeries();
}

function rebuildSeries(){
  if(series) chart.removeSeries(series);
  if(smaSeries) chart.removeSeries(smaSeries);

  const type=typeSel.value;
  if(type==='candle')      series=chart.addCandlestickSeries();
  else if(type==='line')   series=chart.addLineSeries({color:'var(--accent)',lineWidth:2});
  else if(type==='area')   series=chart.addAreaSeries({topColor:'#1e90ff55',bottomColor:'#1e90ff11',lineColor:'#1e90ff',lineWidth:2});

  smaSeries=chart.addLineSeries({color:'var(--yellow)',lineWidth:1});
}

async function loadData(){
  closes=[]; lastAbove=null; sigArr=[]; tableBody.innerHTML='';
  series.setData([]); smaSeries.setData([]);
  if(ws) ws.close();

  const sym=pairSel.value.toUpperCase(); const int=intSel.value;
  const url=`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${int}&limit=${CHART_LIMIT}`;
  const kl=await fetch(url).then(r=>r.json());
  const hist=kl.map(k=>({
      time:k[0]/1000, open:+k[1],high:+k[2],low:+k[3],close:+k[4]
  }));
  series.setData(hist);
  hist.forEach(p=>{ closes.push(p.close); if(closes.length>20) closes.shift(); drawSMA(p.time); });

  connectWS(sym,int);
}

function connectWS(sym,int){
  ws=new WebSocket(`wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${int}`);
  ws.onmessage=e=>{
    const k=JSON.parse(e.data).k;
    const p={time:k.t/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c};
    series.update(p);

    if(k.x){                      // vela fechou
      closes.push(p.close); if(closes.length>20) closes.shift();
      drawSMA(p.time);            // atualiza SMA
      checkSignal(p);
    }
  };
}

function drawSMA(t){
  if(closes.length<20) return;
  const sma=closes.reduce((a,b)=>a+b,0)/closes.length;
  smaSeries.update({time:t,value:sma});
}

function checkSignal(p){
  const smaLast=smaSeries.lastValue().value;
  const above=p.close>smaLast;
  if(lastAbove===null){ lastAbove=above; return; }
  if(above!==lastAbove){
    const type=above?'BUY':'SELL';
    addMarker(p.time,type);
    addTableRow(p.time,type,p.close);
    notify(type,p.close);
  }
  lastAbove=above;
}

/* ===== SINAIS VISUAIS ===== */
function addMarker(t,type){
  series.setMarkers([{time:t,position:type==='BUY'?'belowBar':'aboveBar',color:type==='BUY'?'var(--green)':'var(--red)',shape:'arrowUp',text:type}]);
}
function addTableRow(t,type,price){
  const date=new Date(t*1000).toLocaleTimeString('pt-BR');
  const tr=`<tr>
    <td>${date}</td><td>${pairSel.value.toUpperCase()}</td>
    <td>${intSel.value}</td><td class="${type==='BUY'?'buy':'sell'}">${type}</td>
    <td>${price.toFixed(2)}</td></tr>`;
  tableBody.insertAdjacentHTML('afterbegin',tr);
  if(tableBody.rows.length>30) tableBody.deleteRow(-1);
}

/* ===== ALERTAS ===== */
function notify(type,price){
  playBeep();
  pushNotif(`${type} ${pairSel.value.toUpperCase()} @ ${price.toFixed(2)}`);
  sendTG(type,price);
}
function playBeep(){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type='square';o.frequency.value=typeSel.value==='BUY'?700:450;o.connect(g);g.connect(ctx.destination);g.gain.value=.1;
  o.start();setTimeout(()=>{o.stop();ctx.close();},200);
}
function pushNotif(msg){
  if(!('Notification'in window)) return;
  if(Notification.permission==='granted') new Notification('Trade Insights',{body:msg});
  else if(Notification.permission!=='denied') Notification.requestPermission();
}
function sendTG(type,price){
  if(!BOT_TOKEN||!CHAT_ID) return;
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:CHAT_ID,text:`${type} ${pairSel.value.toUpperCase()} ${price.toFixed(2)} (${intSel.value})`})
  });
}
