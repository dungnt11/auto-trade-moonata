// Fix telegram
process.env.NTBA_FIX_319 = 1;

const puppeteer = require("puppeteer-extra");
const cron = require("cron");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const TelegramBot = require("node-telegram-bot-api");

const capchaApi = "74dff1d33afbc505c712408e4bc8c5c2";
const TELEGRAM_TOKEN = "5205509778:AAEOFE72whCgwOmgr8O-PY1C2h6KZrbAwX4";
const TELEGRAM_CHANNEL = `@bot_bao_lenh`;

const TelegramAll = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
global["TeleGlobal"] = TelegramAll;

puppeteer.use(
  RecaptchaPlugin({
    provider: {
      id: "2captcha",
      token: capchaApi, // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
    },
    visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
  })
);

function coverLastResult(resultArg) {
  if (typeof resultArg === "undefined") return "⚪️";
  if (typeof resultArg === "number") {
    switch (resultArg) {
      case 0:
        return "🟢";
      case 1:
        return "🔴";

      default:
        return "🏳️";
    }
  } else {
    // In từ lịch sử
    if (typeof resultArg !== "undefined") {
      switch (resultArg.lastResult) {
        case 0:
          return "🟢";
        case 1:
          return "🔴";

        default:
          return "🏳️";
      }
    }
  }
}

var lastResult = null; // 0: Xanh 1: Đỏ
var idLastSession = null; // ID phiên cuối cùng tương ứng kết quả ở trên
var d = null;

var historyEnterOrder = []; // Lịch sử vào lệnh
var lastEnterTheOrder = {
  enable: false,
  money: 0,
  trend: "", // Up | Down
  sessionID: 0, // Phiên giao dịch
  isWin: false,
  time: "", // Thời gian vào lệnh
  isGoOrder: false,
  ind: 0, // Số lần vào lệnh. Sẽ vào lệnh theo CONFIG -> nếu vượt quá số lần vào lệnh sẽ dừng lại.
};

/**
 * Tất cả config ở đây
 */
const CONFIG = {
  autoTrade: false,
  countTradeContinue: 7, // 7 lệnh thông thì đánh ngược lại
  moneyEnterOrder: [5, 10, 20, 40], // Nếu gặp 7 lệnh thông sẽ đánh ngược lại với từng mệnh giá này
  maxHistory: 40, // Lưu lại lịch sử 40 phiên
  historys: [], // Lưu lại lịch sử
};

function roleEnterOrder(sessionID, lastResult) {
  // Xử lý lịch sử
  if (CONFIG.historys.length >= CONFIG.maxHistory) {
    CONFIG.historys.shift();
  }
  CONFIG.historys.push({ sessionID, lastResult });

  // 1. Số lệnh thông = 7 thì đánh lệnh ngược lại
  const listContinue = CONFIG.historys.slice(
    CONFIG.historys.length - CONFIG.countTradeContinue * 2,
    CONFIG.historys.length
  );
  let isNotBreakdowUp = true; // Xanh
  let isNotBreakdowDown = true; // Đỏ
  listContinue.reverse().forEach((e, ind) => {
    if (ind % 2 === 0) {
      // Xét các phiên chẵn
      if (e.lastResult === 0) {
        // Xanh
        isNotBreakdowDown = false;
      } else {
        isNotBreakdowUp = false;
      }
    }
  });

  if (
    (isNotBreakdowUp || isNotBreakdowDown) &&
    CONFIG.historys.length >= CONFIG.countTradeContinue * 2
  ) {
    if (CONFIG.autoTrade) {
      TeleGlobal.sendMessage(
        TELEGRAM_CHANNEL,
        `Hệ thống sẽ tự động vào lệnh cho phiên tiếp theo`,
        { parse_mode: "HTML" }
      );

      lastEnterTheOrder.enable = true;
      lastEnterTheOrder.sessionID = idLastSession + 1;

      if (isNotBreakdowUp) {
        lastEnterTheOrder.trend = "sell";
      }
      if (isNotBreakdowDown) {
        lastEnterTheOrder.trend = "buy";
      }
    } else {
      TeleGlobal.sendMessage(
        TELEGRAM_CHANNEL,
        `Hệ thống đang thông ${
          CONFIG.countTradeContinue
        } lệnh ${coverLastResult(
          lastResult
        )} liên tiếp. Mời bạn vào lệnh phiên sau!`,
        { parse_mode: "HTML" }
      );
    }
  }
}

// check xem có phiên nào đang vào lệnh không
function checkSessionEnterOrder(sessionIDEnd, lastResultSessionEnd) {
  if (sessionIDEnd === lastEnterTheOrder.sessionID + 1 && lastEnterTheOrder.isGoOrder && CONFIG.moneyEnterOrder[lastEnterTheOrder.ind]) {
    // Nếu đang bật auto vào lệnh thì mới kiểm tra
    const coverResult = (() => {
      switch (lastResultSessionEnd) {
        case 0: // Xanh
          return "buy";
        case 1: // Đỏ
          return "sell";
        default:
          return undefined;
      }
    })();

    if (coverResult) {
      if (lastEnterTheOrder.trend === coverResult) {
        TeleGlobal.sendMessage(
          TELEGRAM_CHANNEL,
`Bạn vừa thắng lệnh phiên ${lastEnterTheOrder.sessionID} với lệnh ${lastEnterTheOrder.trend}.
⏰: ${lastEnterTheOrder.time}
💰 Lãi: ${CONFIG.moneyEnterOrder[lastEnterTheOrder.ind] * 0.95}$
💰 Tổng: ${d.demoBalance + CONFIG.moneyEnterOrder[lastEnterTheOrder.ind] * 0.95}`,
          { parse_mode: "HTML" }
        );
        d.demoBalance += CONFIG.moneyEnterOrder[lastEnterTheOrder.ind] * 0.95;
        // Update history
        const indHistoryOrder = historyEnterOrder.findIndex((e) => e.sessionID === lastEnterTheOrder.sessionID);
        if (indHistoryOrder > -1) {
          historyEnterOrder[indHistoryOrder].isWin = true;
        }

        // Nếu phiên vừa rồi đánh trúng
        lastEnterTheOrder = {
          enable: false,
          money: 0,
          trend: "", // Up | Down
          sessionID: 0, // Phiên giao dịch
          time: "", // Thời gian vào lệnh
          isGoOrder: false,
          ind: 0, // Số lần vào lệnh. Sẽ vào lệnh theo CONFIG -> nếu vượt quá số lần vào lệnh sẽ dừng lại.
        };
      } else {
        TeleGlobal.sendMessage(
          TELEGRAM_CHANNEL,
`Bạn vừa thua lệnh phiên ${lastEnterTheOrder.sessionID} với lệnh ${lastEnterTheOrder.trend}.
⏰: ${lastEnterTheOrder.time}
💰 Thua: ${CONFIG.moneyEnterOrder[lastEnterTheOrder.ind]}$
💰 Tổng: ${d.demoBalance - CONFIG.moneyEnterOrder[lastEnterTheOrder.ind]}$
Bạn sẽ vào lệnh ở phiên tiếp theo(${lastEnterTheOrder.sessionID + 1})!`,
          { parse_mode: "HTML" }
        );
        d.demoBalance -= CONFIG.moneyEnterOrder[lastEnterTheOrder.ind];
        // Thua ở đâu gấp đôi ở đó
        lastEnterTheOrder.ind += 1;
        lastEnterTheOrder.sessionID += 1;
      }
    }
  }
}

function drawHistory() {
  return `
${coverLastResult(CONFIG.historys[0])} ${coverLastResult(
    CONFIG.historys[4]
  )} ${coverLastResult(CONFIG.historys[8])} ${coverLastResult(
    CONFIG.historys[12]
  )} ${coverLastResult(CONFIG.historys[16])}    ${coverLastResult(
    CONFIG.historys[20]
  )} ${coverLastResult(CONFIG.historys[24])} ${coverLastResult(
    CONFIG.historys[28]
  )} ${coverLastResult(CONFIG.historys[32])} ${coverLastResult(
    CONFIG.historys[36]
  )}
${coverLastResult(CONFIG.historys[1])} ${coverLastResult(
    CONFIG.historys[5]
  )} ${coverLastResult(CONFIG.historys[9])} ${coverLastResult(
    CONFIG.historys[13]
  )} ${coverLastResult(CONFIG.historys[17])}    ${coverLastResult(
    CONFIG.historys[21]
  )} ${coverLastResult(CONFIG.historys[25])} ${coverLastResult(
    CONFIG.historys[29]
  )} ${coverLastResult(CONFIG.historys[33])} ${coverLastResult(
    CONFIG.historys[37]
  )}
${coverLastResult(CONFIG.historys[2])} ${coverLastResult(
    CONFIG.historys[6]
  )} ${coverLastResult(CONFIG.historys[10])} ${coverLastResult(
    CONFIG.historys[14]
  )} ${coverLastResult(CONFIG.historys[18])}    ${coverLastResult(
    CONFIG.historys[22]
  )} ${coverLastResult(CONFIG.historys[26])} ${coverLastResult(
    CONFIG.historys[30]
  )} ${coverLastResult(CONFIG.historys[34])} ${coverLastResult(
    CONFIG.historys[38]
  )}
${coverLastResult(CONFIG.historys[3])} ${coverLastResult(
    CONFIG.historys[7]
  )} ${coverLastResult(CONFIG.historys[11])} ${coverLastResult(
    CONFIG.historys[15]
  )} ${coverLastResult(CONFIG.historys[19])}    ${coverLastResult(
    CONFIG.historys[23]
  )} ${coverLastResult(CONFIG.historys[27])} ${coverLastResult(
    CONFIG.historys[31]
  )} ${coverLastResult(CONFIG.historys[35])} ${coverLastResult(
    CONFIG.historys[39]
  )}
    `;
}

puppeteer
  .launch({ headless: true, args: ["--no-sandbox"] })
  .then(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://moonata1.net/login");
    await page.type('input[name="email"]', "gavol68807@ishop2k.com", {
      delay: 100,
    });
    await page.type('input[name="password"]', "123123", { delay: 100 });
    await page.click(
      "#main-content > div > div > div > div.boxAuthentication.show > div > div.formWapper.w-100 > form > div.form-group.text-center > button"
    );

    await page.solveRecaptchas();
    await Promise.all([page.waitForNavigation()]);

    const job = new cron.CronJob({
      cronTime: "45 0/1 * * * *",
      onTick: async function () {
        await page.reload({ waitUntil: ["networkidle0"] });
      },
    });
    job.start();
    let cdp = await page.target().createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Page.enable");
    let id = 1;
    count = 0;
    let countStaticData = 0;
    let t;

    const printResponse = async function (cdp, response) {
      if (!response.response) {
        return;
      }
      let data = response.response.payloadData;
      if (data.includes("BO_CHART_INDICATORS")) {
        const moneyOrder = CONFIG.moneyEnterOrder[lastEnterTheOrder.ind]; // Tiền vào lệnh
        if (
          lastEnterTheOrder.enable &&
          idLastSession + 1 === lastEnterTheOrder.sessionID &&
          moneyOrder
        ) {
          // Tự động vào lệnh theo chỉ thị
          const enterOrdered = await enterOrderFn(
            lastEnterTheOrder.trend,
            moneyOrder,
            TELEGRAM_CHANNEL
          );
          if (enterOrdered) {
            // Nếu vào lệnh thành công
            lastEnterTheOrder.money = moneyOrder;
            lastEnterTheOrder.trend = lastEnterTheOrder.trend;
            lastEnterTheOrder.sessionID = idLastSession + 1;
            lastEnterTheOrder.time = new Date().toLocaleString();
            lastEnterTheOrder.isWin = false;
            lastEnterTheOrder.enable = false;
            lastEnterTheOrder.isGoOrder = true;
            historyEnterOrder.push(lastEnterTheOrder);
          }
        }
      }
      if (
        data.includes("SOCKET_BO_LAST_RESULT") &&
        data.includes("finalSide")
      ) {
        let str = response.response.payloadData;
        const dataParse = JSON.parse(str.substr(2, str.length))[1][0];
        if (id !== dataParse.id) {
          count = 0;
          id = dataParse.id;
        } else {
          count++;
        }
        if (count == 4) {
          let finalSide = dataParse.finalSide;
          if (finalSide === "UP") {
            lastResult = 0;
          } else if (finalSide === "DOWN") {
            lastResult = 1;
          } else if (finalSide === "NORMAL") {
            lastResult = 2;
          }
          idLastSession = dataParse.session;
          // Xử lý các trường hợp
          roleEnterOrder(dataParse.session, lastResult);
          checkSessionEnterOrder(dataParse.session, lastResult);
        }
      }
      if (data === "3") {
        countStaticData++;
      } else {
        countStaticData = 0;
      }
      if (countStaticData === 2) {
        cdp.detach();
        cdp = await page.target().createCDPSession();
        await cdp.send("Network.enable");
        await cdp.send("Page.enable");
        cdp.on("Network.webSocketFrameReceived", printResponse.bind(this, cdp));
      }
    };
    cdp.on("Network.webSocketFrameReceived", printResponse.bind(this, cdp));
    cdp.on("Network.webSocketCreated", () => {
      console.log("Vào webSocketCreated");
    });

    page.on('response', async (response) => {
      const request = response.request();
      if (request.url().includes('binaryoption/spot-balance')){
          const res = await response.json();
          if (res.ok) {
            d = res.d;
          }
      }
  })

    function isEnterOrderFn() {
      return page.evaluate(() => {
        const btnCheck = document.querySelector(
          "#betAmount > div:nth-child(5) > div > div:nth-child(1) > button"
        );
        if (btnCheck) {
          const isDisableBtn = btnCheck.hasAttribute("disabled");
          return !isDisableBtn;
        }
        return false;
      });
    }
    // Vào lệnh: type - buy/sell
    async function enterOrderFn(type, countMoney, myTelegramID) {
      const isEnterOrder = await isEnterOrderFn();
      if (isEnterOrder) {
        await page.type(`input#InputNumber`, String(countMoney), {
          delay: 100,
        });
        const isEnterOrderSuccess = await page.evaluate((typeArg) => {
          let result = false;
          // Nút vào lệnh
          if (typeArg === "buy") {
            const btnBuy = document.querySelector(
              "#betAmount > div:nth-child(5) > div > div:nth-child(1) > button"
            );
            if (btnBuy) {
              btnBuy.click();
              result = true;
            }
          }
          if (typeArg === "sell") {
            const btnSell = document.querySelector(
              "#betAmount > div:nth-child(5) > div > div:nth-child(3) > button"
            );
            if (btnSell) {
              btnSell.click();
              result = true;
            }
          }
          return result;
        }, type);
        if (isEnterOrderSuccess) {
          TeleGlobal.sendMessage(
            myTelegramID,
            `👌 Đặt lệnh ${type} | ${countMoney}$ | ${idLastSession + 1} thành công!`,
            { parse_mode: "HTML" }
          );
        } else {
          TeleGlobal.sendMessage(
            myTelegramID,
            `⚠️ Có lỗi trong quá trình đặt lệnh!`,
            { parse_mode: "HTML" }
          );
        }

        await page.reload({ waitUntil: ["networkidle0"] });
      }
      return isEnterOrder;
    }

    // Auto vào lệnh
    TeleGlobal.on("message", async ({ text, from }) => {
      const myTelegramID = from.id;
      if (text === "/start") {
        TeleGlobal.sendMessage(
          myTelegramID,
          `1. /config - lấy cấu hình hiện tại;
2. /enable_auto_trade - Bật auto trade;
3. /disable_auto_trade - Tắt auto trade;
4. /set_count_trade:[number] - Gặp số lượng lệnh thông như này thì đánh ngược lại
5. /set_money_enter:[5,10,20,40] - Vào tiền khi đủ điều kiện
6. /history - Vào tiền khi đủ điều kiện
7. /check_tk - Vào tiền khi đủ điều kiện
8. /analytic - Thống kê theo ngày;`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (text === "/config") {
        const { historys, ...CONFIG_CLONED } = CONFIG;
        // Show all configs
        TeleGlobal.sendMessage(
          myTelegramID,
          JSON.stringify(CONFIG_CLONED, null, 2),
          { parse_mode: "HTML" }
        );
        return;
      }

      if (text === "/check_tk") {
        TeleGlobal.sendMessage(
          TELEGRAM_CHANNEL,
          `
💰 TK Demo: ${d.demoBalance}
💰 TK USDT: ${d.usdtAvailableBalance}
💰 TK ALI: ${d.aliAvailableBalance}
          `,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (text === "/enable_auto_trade") {
        CONFIG.autoTrade = true;
        TeleGlobal.sendMessage(
          myTelegramID,
          `Bật auto trade thành công!.
Để vào lệnh 1 phiên bất kì:
BUY: /buy:[number]
SELL: /sell:[number]`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (text === "/disable_auto_trade") {
        CONFIG.autoTrade = false;
        TeleGlobal.sendMessage(
          myTelegramID,
          `Tắt auto trade thành công!.
Để vào lệnh 1 phiên bất kì:
BUY: /buy:[number]
SELL: /sell:[number]`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (text === "/history") {
        TeleGlobal.sendMessage(myTelegramID, drawHistory(), {
          parse_mode: "HTML",
        });
        return;
      }

      if (text.toLowerCase() === "test") {
        lastEnterTheOrder.enable = true;
        lastEnterTheOrder.sessionID = idLastSession + 1;
        lastEnterTheOrder.trend = "sell";

        TeleGlobal.sendMessage(
          myTelegramID,
          `Bật chế độ test. Bạn sẽ vào lệnh mua ở phiên sau!`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (text.toLowerCase() === "kq") {
        TeleGlobal.sendMessage(
          myTelegramID,
          JSON.stringify({ lastEnterTheOrder, idLastSession }, null, 2),
          { parse_mode: "HTML" }
        );
        return;
      }

      // Nếu đang trong phiên chờ thì không mua bán gì
      if (text.startsWith("/buy:")) {
        const totalBuy = Number(text.replace("/buy:", ""));
        if (!Number.isNaN(totalBuy)) {
          await enterOrderFn("buy", totalBuy, myTelegramID);
        }
      } else if (text.startsWith("/sell:")) {
        const totalSell = Number(text.replace("/sell:", ""));
        if (!Number.isNaN(totalSell)) {
          await enterOrderFn("sell", totalSell, myTelegramID);
        }
      }
    });
  });