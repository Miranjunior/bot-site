// netlify/functions/signal.js
//
// 1. recebe { price, sma, rsi, macdHist, interval, symbol }
// 2. chama ChatGPT (gpt-4o-mini) usando function-calling
// 3. devolve JSON { action, confidence, comment }
// ----------------------------------------------------------

import OpenAI from "openai";          // Netlify usa Node18 ES-modules

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY  // vem do painel Netlify
});

export const handler = async (event) => {
  try {
    const ctx = JSON.parse(event.body ?? "{}");

    /* --- chamada ao ChatGPT em JSON-mode --- */
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      functions: [{
        name: "trade_signal",
        description: "Decide a melhor ação de trade",
        parameters: {
          type: "object",
          properties: {
            action:     { type: "string", enum: ["BUY","SELL","WAIT"] },
            confidence: { type: "number" },
            comment:    { type: "string" }
          },
          required: ["action","confidence","comment"]
        }
      }],
      function_call: { name: "trade_signal" },
      messages: [
        { role: "system",
          content: "Você é um assistente de trading. Responda apenas via função trade_signal." },
        { role: "user",
          content:
`Par: ${ctx.symbol}
Preço: ${ctx.price}
SMA(14): ${ctx.sma}
RSI(14): ${ctx.rsi}
MACD(hist): ${ctx.macdHist}

Para o próximo candle de ${ctx.interval}, qual a melhor ação?`
        }
      ]
    });

    const result = JSON.parse(
      chat.choices[0].message.function_call.arguments
    );

    return {
      statusCode: 200,
      body: JSON.stringify(result)   // {action,confidence,comment}
    };

  } catch (err) {
    console.error("signal.js error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
