// Fix telegram
process.env.NTBA_FIX_319 = 1;
const puppeteer = require("puppeteer-extra");
const cron = require("cron");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const TelegramBot = require("node-telegram-bot-api");

const db = require("./database");

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

/**
 * 0: Xanh
 * 1: Đỏ
 * 2: Hoà
 */
let lastResult = null;
/**
 * Phiên hiện tại
 * Nếu -1 tức là đang trong phiên chờ
 */
let currentSessionID = null;
let d = null; // Ví tiền user
let dInWeb = null; // Ví tiền theo web

/**
 * Tất cả config ở đây
 */
const CONFIG = {
  autoTrade: true,
  countTradeContinue: 2, // 7 lệnh thông thì đánh ngược lại
  moneyEnterOrder: [5, 10, 20, 40, 80], // Nếu gặp 7 lệnh thông sẽ đánh ngược lại với từng mệnh giá này
  maxHistory: 40, // Lưu lại lịch sử 40 phiên
  historys: [], // Lịch sử lệnh
  enterOrderList: [], // Lệnh đang vào
};

puppeteer
  .launch({ headless: true, args: ["--no-sandbox"] })
  .then(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setDefaultNavigationTimeout(0);
    await page.goto("https://moonata2.net/login");
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
    let countStaticData = 0;
    let count;

    const printResponse = async function (cdp, response) {
      if (!response.response || !page || !page.evaluate) {
        return;
      }
      let data = response.response.payloadData;

      if (data.includes("BO_PRICE")) {
        let isDisableBtn = false;
        try {
          isDisableBtn = await page.evaluate(() => {
            if (!document) return false;
            const btnCheck = document.querySelector(
                "#betAmount > div:nth-child(5) > div > div:nth-child(1) > button"
            );
            return btnCheck && !btnCheck.hasAttribute("disabled");
          }); 
        } catch (error) {
          console.log(`Không tìm thấy page!`);
        }
        currentSessionID = isDisableBtn ? JSON.parse(data.substr(2, data.length))[1].session : -1;
        // if (currentSessionID !== -1) console.log('currentSessionID', currentSessionID);
        const indSessionID = CONFIG.enterOrderList.findIndex((e) => e.sessionID === currentSessionID && e.enable);
        if (indSessionID > -1 && isDisableBtn) {
          CONFIG.enterOrderList[indSessionID].enable = false;
          CONFIG.enterOrderList[indSessionID].time = new Date().toLocaleString('vi-VN');
          const moneyEnterOrder = CONFIG.moneyEnterOrder[CONFIG.enterOrderList[indSessionID].ind];
          await enterOrderFn(CONFIG.enterOrderList[indSessionID].trend === 0 ? 'buy' : 'sell', moneyEnterOrder, TELEGRAM_CHANNEL, CONFIG.enterOrderList[indSessionID].sessionID);
        }
      }

      if (
        data.includes("SOCKET_BO_LAST_RESULT") &&
        data.includes("finalSide")
      ) {
        const dataParse = JSON.parse(data.substr(2, data.length))[1][0];
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

          if (currentSessionID !== -1) {
            // Không tính nến chờ
            roleEnterOrder(dataParse.session, lastResult);
            // TeleGlobal.sendMessage(
            //     TELEGRAM_CHANNEL,
            //     `Kết thúc phiên ${dataParse.session} với kết quả ${coverLastResult(lastResult)}`,
            //     { parse_mode: "HTML" }
            // );
          }
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
            if (!d) {
              d = res.d;
            }
            dInWeb = res.d;
          }
      }
    })

    // Vào lệnh: type - buy/sell
    async function enterOrderFn(type, countMoney, myTelegramID, sessionIDArg) {
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
          `👌 Đặt lệnh ${type} | ${countMoney}$ ${` | ${sessionIDArg}` || ""} thành công!`,
          { parse_mode: "HTML" }
        );
      } else {
        TeleGlobal.sendMessage(
          myTelegramID,
          `⚠️ Có lỗi trong quá trình đặt lệnh!`,
          { parse_mode: "HTML" }
        );
      }
    }

    // Auto vào lệnh
    TeleGlobal.on("message", async ({ text, from }) => {
      const myTelegramID = from.id;

      if (text.toLowerCase() === 't') {
        const enterOrder = {
          enable: true,
          ind: 0, // Lần vào lệnh thua
          isWin: false,
          trend: 0, // Lệnh vào buy
          sessionID: currentSessionID + (currentSessionID === -1 ? 1 : 2), // Phiên vào lệnh
          time: '', // Tgian vào lệnh
        }
        CONFIG.enterOrderList.push(enterOrder);

        TeleGlobal.sendMessage(
            myTelegramID,
            `Bạn đang vào chế độ test. Bạn sẽ vào lệnh buy ở phiên ${enterOrder.sessionID}!`,
            { parse_mode: "HTML" }
        );
        return;
      }

      if (text.toLowerCase() === "kq") {
        TeleGlobal.sendMessage(
            myTelegramID,
            JSON.stringify(CONFIG.enterOrderList, null, 2),
            { parse_mode: "HTML" }
        );
        return;
      }

      if (text === "/start") {
        TeleGlobal.sendMessage(
          myTelegramID,
          `1. /config - lấy cấu hình hiện tại;
2. /enable_auto_trade - Bật auto trade;
3. /disable_auto_trade - Tắt auto trade;
4. /set_count_trade:number - Gặp số lượng lệnh thông như này thì đánh ngược lại;
5. /set_money_enter:number1,number2 - Vào tiền khi đủ điều kiện;
6. /history - Vào tiền khi đủ điều kiện;
7. /check_tk - Check tiền ví;
8. /view_history - Xem toàn bộ lịch sử vào lệnh;`,
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
        if (!dInWeb) {
          TeleGlobal.sendMessage(
              myTelegramID,
              `Chưa lấy được thông tin ví`,
              { parse_mode: "HTML" }
          );

          return;
        }
        TeleGlobal.sendMessage(
          myTelegramID,
          `
💰 TK Demo: ${dInWeb.demoBalance}
💰 TK USDT: ${dInWeb.usdtAvailableBalance}
💰 TK ALI: ${dInWeb.aliAvailableBalance}
          `,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (text === "/enable_auto_trade") {
        CONFIG.autoTrade = true;
        TeleGlobal.sendMessage(
          myTelegramID,
          `Bật auto trade thành công!`,
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

      if (text.startsWith('/set_count_trade')) {
        const countTrade = Number(text.replace("/set_count_trade:", ""));
        CONFIG.countTradeContinue = countTrade;
        TeleGlobal.sendMessage(myTelegramID, `Cập nhật thành công. ${countTrade} lệnh thông thì đánh ngược lại`, {
          parse_mode: "HTML",
        });
        return;
      }

      if (text.startsWith('/set_money_enter')) {
        const moneyEnterOrderNew = text.replace("/set_money_enter:", "").split(',');
        CONFIG.moneyEnterOrder = moneyEnterOrderNew;
        TeleGlobal.sendMessage(myTelegramID, `Cập nhật thành công. ${moneyEnterOrderNew.join(',')} số tiền giới hạn khi đánh đảo chiều`, {
          parse_mode: "HTML",
        });
        return;
      }

      if (text.startsWith('/view_history')) {
        db.query(
          `SELECT * FROM histories ORDER BY id desc`,
          [], (error, results) => {
              if (error) {
                console.log(error);
                TeleGlobal.sendMessage(myTelegramID, `Truy vấn lịch sử thất bại!`, {
                  parse_mode: "HTML",
                });
               } else {
                 let textResult = '';
   
                 if (!results.length) {
                   textResult = 'Chưa có lịch sử giao dịch!';
                 } else {
                   results.forEach((e) => {
                     textResult += `${e.time} | ${e.sessionID} | ${e.trend} | ${e.isWin ? 'Thắng' : 'Thua'} ${e.money}$\n`;
                   });
                 }
                 TeleGlobal.sendMessage(myTelegramID, textResult, { parse_mode: "HTML" });
               }
          }
        )
      }
    });
  });


/**
 * Hàm này xử lý sau mỗi phiên có kết quả
 * @param sessionID
 * @param lastResult
 */
function roleEnterOrder(sessionID, lastResult) {
  // Xử lý lịch sử
  if (CONFIG.historys.length >= CONFIG.maxHistory) {
    CONFIG.historys.shift();
  }
  CONFIG.historys.push({ sessionID, lastResult });

  /**
   * PHIÊN ĐÃ VÀO LỆNH SẼ CHECK
   * sessionID - 1 = enterOrder.sessionID
   */
  function currentEnterOrderFn() {
    const indEnterOrder = CONFIG.enterOrderList.findIndex((e) => e.sessionID === sessionID - 1);
    if (indEnterOrder === -1) return undefined;
    return CONFIG.enterOrderList[indEnterOrder];
  }

  // Xoá phiên hiện tại
  function deleteCurrentEnterOrder() {
    CONFIG.enterOrderList = CONFIG.enterOrderList.filter((e) => e.sessionID !== sessionID - 1);
  }

  const currentEnterOrder = currentEnterOrderFn();

  if (currentEnterOrder) {
    if (currentEnterOrder.trend === lastResult) {
      // WIN session
      TeleGlobal.sendMessage(
          TELEGRAM_CHANNEL,
`🎉 Bạn vừa thắng lệnh phiên ${sessionID - 1} với lệnh ${coverLastResult(lastResult)}.
⏰ Vào lệnh: ${currentEnterOrder.time}
💰 Lãi: ${CONFIG.moneyEnterOrder[currentEnterOrder.ind] * 0.95}$
💰 Tổng: ${d.demoBalance + CONFIG.moneyEnterOrder[currentEnterOrder.ind] * 0.95}`,
          { parse_mode: "HTML" }
      );
      d.demoBalance += CONFIG.moneyEnterOrder[currentEnterOrder.ind] * 0.95;

      db.query(`INSERT INTO histories (sessionID, trend, time, isWin, money) 
      VALUES(?,?,?,?,?)`,
      [
          sessionID - 1,
          coverLastResult(lastResult),
          currentEnterOrder.time,
          1, 
          CONFIG.moneyEnterOrder[currentEnterOrder.ind] * 0.95, 
      ]);

      deleteCurrentEnterOrder();
    } else {
      // Nếu vẫn còn vốn xoay vòng thì đánh tiếp
      if (currentEnterOrder.ind < CONFIG.moneyEnterOrder.length) {
        currentEnterOrder.sessionID += 2;
        TeleGlobal.sendMessage(
          TELEGRAM_CHANNEL,
`🏳 Bạn vừa thua lệnh phiên ${sessionID - 1} với lệnh ${coverLastResult(lastResult)}.
⏰ Vào lệnh: ${currentEnterOrder.time}
💰 Thua: ${CONFIG.moneyEnterOrder[currentEnterOrder.ind]}$
💰 Tổng: ${d.demoBalance - CONFIG.moneyEnterOrder[currentEnterOrder.ind]}$
Bạn sẽ vào lệnh ở phiên tiếp theo(${currentEnterOrder.sessionID})!`,
            { parse_mode: "HTML" }
        );
        d.demoBalance -= CONFIG.moneyEnterOrder[currentEnterOrder.ind];

        db.query(`INSERT INTO histories (sessionID, trend, time, isWin, money) 
        VALUES(?,?,?,?,?)`,
        [
            sessionID - 1,
            coverLastResult(lastResult),
            currentEnterOrder.time,
            0, 
            CONFIG.moneyEnterOrder[currentEnterOrder.ind], 
        ]);

        currentEnterOrder.ind += 1;
        currentEnterOrder.enable = true;
        currentEnterOrder.time = '';
      } else {
        deleteCurrentEnterOrder();
        TeleGlobal.sendMessage(
          TELEGRAM_CHANNEL,
          `Bạn đã thua hết số vốn cài đặt. Hệ thống sẽ không tự động đánh nữa!`,
          { parse_mode: "HTML" }
        );
      }
    }
  }

  // 1. Số lệnh thông = 7 thì đánh lệnh ngược lại
  let isNotBreakdowUp = true; // Xanh
  let isNotBreakdowDown = true; // Đỏ
  let totalEnterOrderContinue = 0;
  const historyReverse = CONFIG.historys.reverse();
  historyReverse.forEach((e, ind) => {
    if (ind < CONFIG.countTradeContinue) {
      if (e.lastResult === 0) {
        // Xanh
        isNotBreakdowDown = false;
      } else {
        isNotBreakdowUp = false;
      }
    }
    // Đếm tổng lệnh thông
    if (e.lastResult === historyReverse[0].lastResult && totalEnterOrderContinue !== -1) {
      totalEnterOrderContinue += 1;
    } else {
      totalEnterOrderContinue = -1;
    }
  });

  // TỰ VÀO LỆNH KHI ĐỦ ĐIỀU KIỆN
  if (
      (isNotBreakdowUp || isNotBreakdowDown) &&
      CONFIG.historys.length >= CONFIG.countTradeContinue
  ) {
    const isEnterOrderd = CONFIG.enterOrderList.map((e) => e.sessionID).includes(sessionID + 1);
    const textAlert = `Hệ thống đang thông ${totalEnterOrderContinue} lệnh ${coverLastResult(lastResult)} liên tiếp.`;
    if (isEnterOrderd) {
      TeleGlobal.sendMessage(
        TELEGRAM_CHANNEL,
        `${textAlert} Bạn đã thua lệnh trước (${sessionID - 1}) nên hệ thống tự vào lệnh tiếp theo theo config!`,
        { parse_mode: "HTML" }
      );
      return;
    } else {
      let trendEnterOrder = -1;
      if (isNotBreakdowUp) {
        // Sell - Đỏ
        trendEnterOrder = 1;
      }
      if (isNotBreakdowDown) {
        // Buy - Xanh
        trendEnterOrder = 0;
      }
      const enterOrder = {
        enable: true,
        ind: 0, // Lần vào lệnh thua
        isWin: true,
        trend: trendEnterOrder, // Lệnh vào
        sessionID: sessionID + 1, // Phiên vào lệnh
        time: '', // Tgian vào lệnh
      }
      
      CONFIG.enterOrderList.push(enterOrder);

      if (CONFIG.autoTrade) {
        TeleGlobal.sendMessage(
            TELEGRAM_CHANNEL,
            `${textAlert} Hệ thống đã tự vào lệnh ${coverLastResult(enterOrder.trend)} cho phiên sau(${enterOrder.sessionID})!`,
            { parse_mode: "HTML" }
        );
      } else {
        TeleGlobal.sendMessage(
            TELEGRAM_CHANNEL,
            `${textAlert} Mời bạn vào lệnh phiên sau!`,
            { parse_mode: "HTML" }
        );
      }
    }
  }
}

function drawHistory() {
  return `
${coverLastResult(CONFIG.historys[0])} ${coverLastResult(CONFIG.historys[4])} ${coverLastResult(CONFIG.historys[8])} ${coverLastResult(CONFIG.historys[12])} ${coverLastResult(CONFIG.historys[16])}    ${coverLastResult(CONFIG.historys[20])} ${coverLastResult(CONFIG.historys[24])} ${coverLastResult(CONFIG.historys[28])} ${coverLastResult(CONFIG.historys[32])} ${coverLastResult(CONFIG.historys[36])}
${coverLastResult(CONFIG.historys[1])} ${coverLastResult(CONFIG.historys[5])} ${coverLastResult(CONFIG.historys[9])} ${coverLastResult(CONFIG.historys[13])} ${coverLastResult(CONFIG.historys[17])}    ${coverLastResult(CONFIG.historys[21])} ${coverLastResult(CONFIG.historys[25])} ${coverLastResult(CONFIG.historys[29])} ${coverLastResult(CONFIG.historys[33])} ${coverLastResult(CONFIG.historys[37])}
${coverLastResult(CONFIG.historys[2])} ${coverLastResult(CONFIG.historys[6])} ${coverLastResult(CONFIG.historys[10])} ${coverLastResult(CONFIG.historys[14])} ${coverLastResult(CONFIG.historys[18])}    ${coverLastResult(CONFIG.historys[22])} ${coverLastResult(CONFIG.historys[26])} ${coverLastResult(CONFIG.historys[30])} ${coverLastResult(CONFIG.historys[34])} ${coverLastResult(CONFIG.historys[38])}
${coverLastResult(CONFIG.historys[3])} ${coverLastResult(CONFIG.historys[7])} ${coverLastResult(CONFIG.historys[11])} ${coverLastResult(CONFIG.historys[15])} ${coverLastResult(CONFIG.historys[19])}    ${coverLastResult(CONFIG.historys[23])} ${coverLastResult(CONFIG.historys[27])} ${coverLastResult(CONFIG.historys[31])} ${coverLastResult(CONFIG.historys[35])} ${coverLastResult(CONFIG.historys[39])}
    `;
}

/**
 * Lấy trạng thái nến
 * @param resultArg - kết quả nến
 * @returns - icon nến
 */
function coverLastResult(resultArg) {
  if (typeof resultArg === "undefined") return "⚪️";
  switch (typeof resultArg === "number" ? resultArg : resultArg.lastResult) {
    case 0:
      return "🟢";
    case 1:
      return "🔴";
    case 2:
      return "🏳️️";

    default:
      return "⚪";
  }
}