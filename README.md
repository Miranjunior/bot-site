# bot-site

## Estratégia de sinais

O painel exibe **sinais de entrada** quando o preço cruza a média móvel
simples de 14 períodos (SMA‑14). Quando o preço fecha **acima** da SMA
é gerado um sinal `BUY` (compra). Caso feche **abaixo** da SMA o sinal
é `SELL`. Esses avisos servem apenas como indicação e não constituem
recomendação financeira.

Os sinais gerados pela função serverless consultam a IA, que devolve uma
ação (`BUY`, `SELL` ou `WAIT`) acompanhada de uma confiança e um
comentário.

## Ajuste de horário

O horário mostrado no eixo do gráfico utiliza o momento de
**fechamento** de cada vela. Essa abordagem mantém a última vela mais
próxima do relógio atual.
