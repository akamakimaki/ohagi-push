"use strict";

/*
 * おはぎを押しつけろ！ 自由移動版
 *
 * 義勇：マウスまたは指へ滑らかに追従する。
 * 実弥：逃げ回り、義勇を狙って突進する。
 * 目的：突進を避け、硬直した実弥へ触れておはぎを食べさせる。
 */

const $ = id => document.getElementById(id);
const stage = $("stage");
const giyu = $("giyu");
const sanemi = $("sanemi");
const giyuImage = $("giyuImage");
const sanemiImage = $("sanemiImage");
const warning = $("warning");
const effect = $("effect");
const burst = $("burst");
const projectiles = $("projectiles");
const result = $("result");
const message = $("message");
const action = $("action");
const hint = $("hint");
const scoreDisplay = $("score");
const pointsDisplay = $("points");
const comboDisplay = $("combo");
const comboPanel = $("comboPanel");
const timeDisplay = $("time");
const timeBar = $("timeBar");
const clock = $("clock");
const bestDisplay = $("best");
const soundButton = $("sound");
const timeUpFlash = $("timeUpFlash");
const finalRush = $("finalRush");
const ending = $("ending");
const endingTitle = $("endingTitle");
const endingScore = $("endingScore");
const endingScoreLabel = $("endingScoreLabel");
const endingDetails = $("endingDetails");
const endingRecord = $("endingRecord");
const historyList = $("history");
const playAgain = $("playAgain");
const shareResult = $("shareResult");
const privateSubmit = $("privateSubmit");
const recordNote = $("recordNote");
// おはぎシリーズ共通ランキング
const RANKING_BASE =
    "https://ohagi-ranking.makimaki-feed.net";

/*
* 同じプレイを二重計上しないためのIDを生成する。
*/
function createPlayEventId() {
    if (
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return globalThis.crypto.randomUUID();
    }

    return (
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2) +
        "_" +
        Math.random().toString(36).slice(2)
    );
}

/*
 * ゲーム終了時の得点だけを匿名統計へ送る。
 * 送信に失敗してもゲーム本体は止めない。
 */
function reportAnonymousPlay(game, playScore) {
    fetch(
        `${RANKING_BASE}/api/play-events`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                event_id: createPlayEventId(),
                game,
                score: playScore
            }),
            keepalive: true
        }
    ).catch(error => {
        console.warn(
            "匿名プレイ統計を送信できませんでした",
            error
        );
    });
}

/*
 * ゲームBGM。
 * ブラウザの自動再生制限があるため、
 * スタートボタンを押したときに再生する。
 */
/*
 * ゲームで使用する音。
 * BGMは繰り返し、効果音は必要な瞬間だけ再生する。
 */
const bgm =
    new Audio("./sounds/bgm.mp3");

const hitSound =
    new Audio("./sounds/hit.mp3");

const windSound =
    new Audio("./sounds/wind.mp3");

const successSound =
    new Audio("./sounds/success.mp3");

const timeupSound =
    new Audio("./sounds/timeup.mp3");

const resultBgm =
    new Audio("./sounds/result.mp3");

bgm.loop = true;
resultBgm.loop = true;
bgm.volume = 0.3;

hitSound.volume = 0.7;
windSound.volume = 0.55;
successSound.volume = 0.65;
timeupSound.volume = 0.75;
resultBgm.volume = 0.22;

bgm.preload = "auto";
hitSound.preload = "auto";
windSound.preload = "auto";
successSound.preload = "auto";
timeupSound.preload = "auto";
resultBgm.preload = "auto";

let soundEnabled = true;

/*
 * 同じ効果音を繰り返し鳴らせるよう、
 * 再生位置を先頭へ戻してから再生する。
 */
function playEffect(audio) {
    if (!soundEnabled) return;

    audio.currentTime = 0;

    audio.play().catch(() => {
        // 再生拒否が起きてもゲームは止めない
    });
}

const GAME_DURATION = 30000;
const GIYU_FOLLOW = 22;
const SANEMI_ROAM_SPEED = 240;
const SANEMI_CHARGE_SPEED = 1050;
const WARNING_DURATION = 520;
const CHARGE_DURATION = 540;
const CHARGE_HOMING = 5.6;
const HIT_DISTANCE = 66;
const FEED_DISTANCE = 82;
const GUARD_DISTANCE = 76;
// 近づくほど実弥が二段階でブチギレる。
const RAGE_DISTANCE = 220;
const FURY_DISTANCE = 135;
const BEST_KEY = "ohagi-push-best-points-v3";
const HISTORY_KEY = "ohagi-push-history-points-v3";

let gameStarted = false;
let roundFinished = false;
let controlActive = false;
let activePointerId = null;
let phase = "ready";
let phaseEndsAt = 0;
let nextAttackAt = 0;
let nextTurnAt = 0;
let guardLockedUntil = 0;
// ガードで弾かれている間、指入力を一時的に止める
let guardPushUntil = 0;
let gameEndTime = 0;
let gameStartedAt = 0;
let lastTime = performance.now();
let resetTimer = 0;

let giyuX = 20;
let giyuY = 190;
let targetGiyuX = 20;
let targetGiyuY = 190;
let sanemiX = 340;
let sanemiY = 190;
let sanemiTargetX = 340;
let sanemiTargetY = 190;
let chargeVX = 0;
let chargeVY = 0;
let chargeSpeed = SANEMI_CHARGE_SPEED;
let chargeNearest = Infinity;
// 二連突進を出すか、現在が二発目かを記録する
let doubleChargeQueued = false;
let secondCharge = false;
let finalRushStarted = false;

let points = 0;
let ohagiCount = 0;
let combo = 0;
let dodgeRank = "good";
let perfectCount = 0;
let justCount = 0;
let hitCount = 0;
// キャラクターとステージの寸法を保存する
let cachedMetrics = null;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


/*
 * DOMサイズの読み取りはレイアウト計算を発生させるため、
 * 開始時と画面サイズ変更時だけ再取得する。
 */
function refreshMetrics() {
    const giyuWidth =
        giyu.offsetWidth || 112;

    const giyuHeight =
        giyu.offsetHeight || 124;

    const sanemiWidth =
        sanemi.offsetWidth || 112;

    const sanemiHeight =
        sanemi.offsetHeight || 124;

    const stageWidth =
        stage.clientWidth;

    const stageHeight =
        stage.clientHeight;

    const edgePadding = 2;

    const minY =
        giyuHeight * .5 +
        edgePadding;

    const maxY =
        stageHeight -
        giyuHeight * .5 -
        edgePadding;

    cachedMetrics = {
        giyuWidth,
        giyuHeight,
        sanemiWidth,
        sanemiHeight,

        giyuMinX:
            edgePadding,

        giyuMaxX:
            stageWidth -
            giyuWidth -
            edgePadding,

        sanemiMaxX:
            stageWidth -
            sanemiWidth -
            edgePadding,

        minY,
        maxY,

        centerY:
            (minY + maxY) / 2
    };

    return cachedMetrics;
}

function metrics() {
    return cachedMetrics ||
        refreshMetrics();
}



function centers() {
    const m = metrics();
    return {
        gx: giyuX + m.giyuWidth * .5,
        gy: giyuY,
        sx: sanemiX + m.sanemiWidth * .5,
        sy: sanemiY
    };
}

function characterDistance() {
    const c = centers();
    return Math.hypot(c.gx - c.sx, c.gy - c.sy);
}

function difficulty(now) {
    // 30秒の経過に合わせて、通常時も徐々に速くなる
    const progress =
        clamp(
            (now - gameStartedAt) /
            GAME_DURATION,
            0,
            1
        );

    const normalDifficulty =
        1 + progress * 0.5;

    // 残り10秒はさらに18％加速
    const remaining =
        gameEndTime - now;

    const finalRushPower =
        remaining <= 10000
            ? 1.18
            : 1;

    return normalDifficulty * finalRushPower;
}

function draw() {
    /*
     * left・topを書き換えると毎フレーム
     * レイアウトの再計算が発生する。
     *
     * translateは既存のtransformアニメーションと
     * 独立して使えるため、ジャンプや吹っ飛びを残したまま
     * キャラクターの座標だけを滑らかに動かせる。
     */
    giyu.style.translate =
        `${giyuX}px ${giyuY}px`;

    sanemi.style.translate =
        `${sanemiX}px ${sanemiY}px`;
}

function updateScoreUI() {
    scoreDisplay.textContent = String(ohagiCount);
    pointsDisplay.textContent = String(points);
    comboDisplay.textContent = String(combo);
    comboPanel.classList.toggle("active", combo >= 2);
}

function clearBattleClasses() {
    stage.classList.remove(
        "warning", "attacking", "cooldown", "success", "hit",
        "guard", "perfect-window", "rank-good", "rank-nice",
        "rank-just", "rank-perfect", "pressing", "dodging", "feint",
        "proximity-rage", "proximity-fury", "controlling"
    );
}

function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

function chooseSanemiTarget(now, forceAway = false) {
    const m = metrics();
    const c = centers();
    const awayAngle = Math.atan2(c.sy - c.gy, c.sx - c.gx);
    const angle = forceAway || characterDistance() < 190
        ? awayAngle + randomRange(-.7, .7)
        : randomRange(0, Math.PI * 2);
    const distance = randomRange(100, 210);

    sanemiTargetX = clamp(
        sanemiX + Math.cos(angle) * distance,
        stage.clientWidth * .18,
        m.sanemiMaxX
    );
    sanemiTargetY = clamp(
        sanemiY + Math.sin(angle) * distance,
        m.minY,
        m.maxY
    );
    nextTurnAt = now + randomRange(200, 480);
}

function resetCharacters(now = performance.now()) {
    const m = refreshMetrics();

    /*
     * 開始時はステージ中央ではなく、
     * 地面寄りの高さへ2人を配置する。
     */
    const startY = clamp(
        stage.clientHeight * 0.68,
        m.minY,
        m.maxY
    );

    giyuX = 18;
    giyuY = startY;
    targetGiyuX = giyuX;
    targetGiyuY = giyuY;

    sanemiX = m.sanemiMaxX - 8;
    sanemiY = startY;
    sanemiTargetX = sanemiX;
    sanemiTargetY = sanemiY;
    chooseSanemiTarget(now, true);
    giyuImage.src = "./images/giyu-attack.png";
    sanemiImage.src = "./images/sanemi-normal.png";
    draw();
}

function startRoaming(now, delay = 520) {
    phase = "roaming";
    nextAttackAt = now + delay + randomRange(180, 520);
    stage.classList.remove(
        "warning", "attacking", "cooldown", "perfect-window",
        "rank-good", "rank-nice", "rank-just", "rank-perfect", "guard",
        "proximity-rage", "proximity-fury"
    );
    /*
     * FINAL中は行動の切り替わりでも怒り顔を維持する。
     */
    sanemiImage.src =
        finalRushStarted
            ? "./images/sanemi-angry.png"
            : "./images/sanemi-normal.png";
    chooseSanemiTarget(now, true);
}

function startWarning(now, isSecond = false) {
    phase = "warning";
    secondCharge = isSecond;

    /*
     * 通常の予兆開始時にだけ二連突進を抽選する。
     * 二発目からさらに連続することはない。
     */
    if (!isSecond) {
        const remaining =
            gameEndTime - now;

        // 通常35％、残り10秒は48％
        const doubleChargeRate =
            remaining <= 10000
                ? 0.48
                : 0.28;

        doubleChargeQueued =
            Math.random() < doubleChargeRate;
    }

    const distance = characterDistance();

    /*
     * 二発目の予兆は短い。
     * 一発目はこれまでの距離別予兆を使用する。
     */
    const warningTime = isSecond
        ? 300
        : distance < FURY_DISTANCE
            ? 350
            : distance < RAGE_DISTANCE
                ? 460
                : WARNING_DURATION;

    phaseEndsAt = now + warningTime;

    const c = centers();
    const m = metrics();

    const targetX = c.gx;
    const targetY = c.gy;
    const startX = c.sx;
    const startY = c.sy;

    const dx = targetX - startX;
    const dy = targetY - startY;
    const length =
        Math.max(1, Math.hypot(dx, dy));

    const closePower =
        distance < FURY_DISTANCE
            ? 1.22
            : distance < RAGE_DISTANCE
                ? 1.1
                : 1;

    /*
     * 二発目は一発目より少し速くする。
     */
    const chainPower =
        isSecond ? 1.1 : 1;

    chargeSpeed =
        SANEMI_CHARGE_SPEED *
        difficulty(now) *
        closePower *
        chainPower;

    chargeVX =
        dx / length * chargeSpeed;

    chargeVY =
        dy / length * chargeSpeed;

    chargeNearest = Infinity;

    warning.style.left =
        `${clamp(
            targetX - 42,
            8,
            stage.clientWidth - 86
        )}px`;

    warning.style.right = "auto";

    warning.style.top =
        `${clamp(
            targetY - 70,
            8,
            m.maxY - 50
        )}px`;

    stage.classList.add("warning");

    sanemiImage.src =
        "./images/sanemi-angry.png";

    result.textContent = isSecond
        ? "まだだァ！"
        : "実弥が怒っている！";

    message.textContent = isSecond
        ? "二発目をかわせ！"
        : "その場所から逃げろ！";
}

function startCharge(now) {
    phase = "charging";
    playEffect(windSound);
    phaseEndsAt = now + CHARGE_DURATION;
    stage.classList.remove("warning", "perfect-window");
    stage.classList.add("attacking");
    burst.textContent = "";
    result.textContent = "突進！";
    message.textContent = "上下左右へかわせ！";
}

function dodgeResult(now) {
    /*
     * 二連突進が選ばれている場合、
     * 一発目では硬直せず二発目へ移る。
     */
    if (
        doubleChargeQueued &&
        !secondCharge
    ) {
        doubleChargeQueued = false;

        stage.classList.remove(
            "attacking"
        );

        burst.textContent =
            "もう一発！";

        startWarning(now, true);
        return;
    }

    const clearedDoubleCharge =
        secondCharge;

    const perfect =
        chargeNearest <=
        HIT_DISTANCE + 24;

    const just =
        chargeNearest <=
        HIT_DISTANCE + 66;

    const baseGained =
        perfect ? 150 :
            just ? 100 :
                50;

    /*
     * 二連突進を両方かわした場合は
     * 追加で100点。
     */
    const chainBonus =
        clearedDoubleCharge ? 100 : 0;

    const gained =
        baseGained + chainBonus;

    dodgeRank =
        perfect ? "perfect" :
            just ? "just" :
                "good";

    points += gained;

    if (perfect) {
        perfectCount++;
    }

    if (just && !perfect) {
        justCount++;
    }

    const labels = {
        perfect:
            `PERFECT！ +${gained}点`,
        just:
            `JUST！ +${gained}点`,
        good:
            `回避！ +${gained}点`
    };

    const stunTimes = {
        perfect: 2600,
        just: 2200,
        good: 1800
    };

    updateScoreUI();

    phase = "stunned";

    /*
     * 二連突進成功後は、
     * おはぎを食べさせる時間も0.5秒延長。
     */
    phaseEndsAt =
        now +
        stunTimes[dodgeRank] +
        (clearedDoubleCharge ? 500 : 0);

    stage.classList.remove(
        "attacking"
    );

    const rankClass =
        dodgeRank === "good"
            ? "rank-nice"
            : `rank-${dodgeRank}`;

    stage.classList.add(
        "cooldown",
        rankClass
    );

    result.textContent =
        labels[dodgeRank];

    message.textContent =
        clearedDoubleCharge
            ? "二連突進をかわした！"
            : "実弥が油断した！";

    burst.textContent =
        clearedDoubleCharge
            ? "二連回避成功！"
            : "今がチャンス！";

    sanemiImage.src =
        "./images/sanemi-angry.png";

    secondCharge = false;

    window.setTimeout(() => {
        if (phase === "stunned") {
            burst.textContent = "";
        }
    }, 650);
}

function receiveHit(now) {
    if (!gameStarted || phase === "hit") return;
    phase = "hit";
    playEffect(hitSound);
    hitCount++;
    combo = 0;
    /*
     * 被弾した瞬間に操作を終了し、
     * 吹っ飛び中の基準座標も固定する。
     */
    controlActive = false;
    activePointerId = null;
    stage.classList.remove("controlling");

    targetGiyuX = giyuX;
    targetGiyuY = giyuY;

    updateScoreUI();

    /*
     * 実弥と反対側へ義勇を吹き飛ばす。
     * CSSへ飛距離と回転方向を渡す。
     */
    const hitCenters = centers();

    const koDirection =
        hitCenters.gx < hitCenters.sx
            ? -1
            : 1;

    stage.style.setProperty(
        "--giyu-ko-near",
        `${koDirection * 75}px`
    );

    stage.style.setProperty(
        "--giyu-ko-middle",
        `${koDirection * 260}px`
    );

    stage.style.setProperty(
        "--giyu-ko-far",
        `${koDirection * (stage.clientWidth + 240)}px`
    );

    stage.style.setProperty(
        "--giyu-ko-spin",
        `${koDirection * 720}deg`
    );
    stage.classList.remove("warning", "attacking", "cooldown");
    stage.classList.add("hit");
    giyuImage.src = "./images/giyu-normal.png";
    effect.textContent = "💥";
    burst.textContent = "ぴょーーん！！";
    result.textContent = "🍃「冨岡ァ！！」";
    message.textContent = "実弥にボギャられた！";

    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
        if (!gameStarted || phase !== "hit") return;
        stage.classList.remove("hit");
        effect.textContent = "";
        burst.textContent = "";
        resetCharacters(performance.now());
        result.textContent = "実弥を追いかけろ！";
        message.textContent = "突進を避けると、おはぎチャンス！";
        startRoaming(performance.now(), 520);
    }, 860);
}

function guardOhagi(now) {
    if (now < guardLockedUntil) return;

    /*
     * ガードの連続発生を防止する。
     * 0.34秒間は義勇を押し戻す動きを優先し、
     * 約0.9秒間は次のガードを発生させない。
     */
    guardLockedUntil = now + 900;
    guardPushUntil = now + 340;
    combo = 0;
    updateScoreUI();

    const c = centers();
    const dx = c.gx - c.sx;
    const dy = c.gy - c.sy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const m = metrics();
    targetGiyuX = clamp(giyuX + dx / length * 105, m.giyuMinX, m.giyuMaxX);
    targetGiyuY = clamp(giyuY + dy / length * 80, m.minY, m.maxY);

    stage.classList.add("guard");
    sanemiImage.src = "./images/sanemi-angry.png";
    result.textContent = "ふざけんなァ！";
    message.textContent = "反撃後のふらつき中を狙おう";
    window.setTimeout(() => stage.classList.remove("guard"), 340);
}

function launchHappyHearts() {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = sanemi.getBoundingClientRect();
    /*
 * スマホは描画負荷を抑え、
 * PCでは今までどおり華やかに表示する。
 */
    const isSmallScreen =
        window.matchMedia("(max-width: 600px)").matches;

    const count = reduced
        ? 12
        : isSmallScreen
            ? 26
            : 42;
    const marks = ["♡", "♡", "♥", "✦", "♡", "✧"];
    const pinks = ["#ff3788", "#ff71ad", "#ffc0dc", "#e62d78", "#ff94c6"];
    const golds = ["#ffd84d", "#fff176", "#ffb52e", "#fff4b0"];

    while (projectiles.children.length + count > 100) {
        projectiles.firstElementChild?.remove();
    }

    for (let i = 0; i < count; i++) {
        const particle = document.createElement("span");
        const mark = marks[i % marks.length];
        const sparkle = mark === "✦" || mark === "✧";
        const size = sparkle ? 18 + Math.random() * 24 : 24 + Math.random() * 42;
        const startX = rect.left + rect.width * .45;
        const startY = rect.top + rect.height * .35;
        const endX = Math.random() * Math.max(1, innerWidth - size);
        const endY = Math.random() * innerHeight * .58;
        const sway = randomRange(-75, 75);

        particle.className = "flying-heart";
        particle.textContent = mark;
        particle.style.fontSize = `${size}px`;
        particle.style.color = sparkle ? golds[i % golds.length] : pinks[i % pinks.length];
        projectiles.appendChild(particle);

        const animation = particle.animate([
            { transform: `translate(${startX}px,${startY}px) scale(.2)`, opacity: 0 },
            { transform: `translate(${endX}px,${endY}px) scale(1.25)`, opacity: .92, offset: .18 },
            { transform: `translate(${endX + sway}px,${endY - 110}px) rotate(12deg)`, opacity: .8, offset: .62 },
            { transform: `translate(${endX - sway}px,${endY - 270}px) scale(.8)`, opacity: 0 }
        ], {
            duration: reduced ? 1200 : 2500 + Math.random() * 900,
            delay: reduced ? 0 : Math.random() * 180,
            easing: "ease-out",
            fill: "both"
        });
        animation.addEventListener("finish", () => particle.remove(), { once: true });
    }
}

function feedOhagi(now) {
    if (!gameStarted || phase !== "stunned") return;
    phase = "success";

    combo++;
    ohagiCount++;

    /*
     * 連続成功するほど成功音を少しずつ高くする。
     *
     * 1連続：1.00倍
     * 3連続：1.16倍
     * 5連続：1.32倍
     * 最大：1.40倍
     */
    successSound.preservesPitch = false;

    successSound.playbackRate =
        Math.min(
            1 + (combo - 1) * .08,
            1.4
        );

    playEffect(successSound);
    /*
     * 回避の上手さと連続成功で得点を伸ばす。
     *
     * 通常回避：1倍
     * JUST：1.5倍
     * PERFECT：2倍
     */
    const rankRate =
        dodgeRank === "perfect"
            ? 2
            : dodgeRank === "just"
                ? 1.5
                : 1;

    /* 連続成功するたび25％ずつ上昇。最大3倍。 */
    const comboRate =
        1 + Math.min(combo - 1, 8) * .25;

    /* FINAL中に食べさせると1.25倍。 */
    const finalRate =
        finalRushStarted
            ? 1.25
            : 1;

    /*
     * 3連続と5連続に節目ボーナス。
     * 6連続以降へ毎回加算されるものではない。
     */
    const streakBonus =
        combo === 5
            ? 500
            : combo === 3
                ? 200
                : 0;

    const gained =
        Math.round(
            300 *
            rankRate *
            comboRate *
            finalRate
        ) +
        streakBonus;

    points += gained;

    /*
     * activeを一度外して再度付けることで、
     * 連続成功のたびにコンボ欄を弾ませる。
     */
    comboPanel.classList.remove("active");
    void comboPanel.offsetWidth;

    updateScoreUI();
    clearBattleClasses();
    stage.classList.add("success");

    /*
     * おはぎを押しつけた瞬間だけキス画像を表示。
     * その後、嬉しそうな画像へ切り替える。
     */
    giyuImage.src = "./images/giyu-kiss.png";
    /*
     * FINAL中はおはぎを食べても怒り顔を維持する。
     */
    sanemiImage.src =
        finalRushStarted
            ? "./images/sanemi-angry.png"
            : "./images/sanemi-happy.png";

    window.setTimeout(() => {
        /*
         * すでにタイムアップした場合や、
         * 成功演出が終了した場合は変更しない。
         */
        if (
            !gameStarted ||
            phase !== "success"
        ) {
            return;
        }

        giyuImage.src =
            "./images/giyu-happy.png";
    }, 220);
    // 加点表示は短いまま維持する。
    burst.textContent = `+${gained}点`;

    /* 節目の連続成功だけ、専用メッセージを表示する。 */
    if (combo === 5) {
        result.textContent =
            "5れんぞく！ 大フィーバー！";
    } else if (combo === 3) {
        result.textContent =
            "3れんぞく！ 絶好調！";
    } else if (combo >= 2) {
        result.textContent =
            `${combo}れんぞく！`;
    } else {
        result.textContent =
            "おはぎ成功！";
    }

    message.textContent =
        ohagiCount % 2
            ? "🌊「たくさん食べろ」"
            : "🍃「うめェけど腹立つ！」";
    launchHappyHearts();

    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
        if (!gameStarted) return;
        stage.classList.remove("success");
        burst.textContent = "";
        giyuImage.src = "./images/giyu-attack.png";
        sanemiImage.src = "./images/sanemi-normal.png";
        chooseSanemiTarget(performance.now(), true);
        result.textContent = "逃げる実弥を追え！";
        message.textContent = "次の攻撃をかわせ！";
        startRoaming(performance.now(), 420);
    }, 950);
}

function moveToward(current, target, distance) {
    if (Math.abs(target - current) <= distance) return target;
    return current + Math.sign(target - current) * distance;
}

function updateSanemi(now, delta) {
    const m = metrics();
    const distance = characterDistance();

    /* 接近に応じて、怒りを通常→警戒→ブチギレの二段階で見せる。 */
    const showProximityRage =
        (phase === "roaming" || phase === "warning") &&
        distance < RAGE_DISTANCE;
    const showProximityFury =
        showProximityRage && distance < FURY_DISTANCE;

    stage.classList.toggle("proximity-rage", showProximityRage);
    stage.classList.toggle("proximity-fury", showProximityFury);

    if (phase === "roaming") {
        /*
 * 接近されたら方向転換を早める。
 * ただし毎フレーム逃げ先を抽選するとカクつくため、
 * 最短でも180msは同じ方向へ移動させる。
 */
        if (distance < 165) {
            nextTurnAt =
                Math.min(
                    nextTurnAt,
                    now + 180
                );
        }

        if (now >= nextTurnAt) {
            chooseSanemiTarget(
                now,
                distance < 165
            );
        }
        /*
         * 接近時は速くなるが、
         * 義勇が追いつけないほどにはしない。
         */
        const rageSpeed =
            showProximityFury
                ? 1.65
                : showProximityRage
                    ? 1.3
                    : 1;
        const speed = SANEMI_ROAM_SPEED * difficulty(now) * rageSpeed * delta;
        const dx = sanemiTargetX - sanemiX;
        const dy = sanemiTargetY - sanemiY;
        const length = Math.max(1, Math.hypot(dx, dy));
        sanemiX = clamp(sanemiX + dx / length * speed, stage.clientWidth * .12, m.sanemiMaxX);
        sanemiY = clamp(sanemiY + dy / length * speed, m.minY, m.maxY);

        /*
         * FINAL中は距離に関係なく、
         * 実弥を常に怒り画像にする。
         */
        sanemiImage.src =
            finalRushStarted || showProximityRage
                ? "./images/sanemi-angry.png"
                : "./images/sanemi-normal.png";

        /* 接近すると、次の突進までの待ち時間も急激に短くなる。 */
        if (showProximityRage) {
            const rageDelay = showProximityFury ? 220 : 480;
            nextAttackAt = Math.min(nextAttackAt, now + rageDelay);
        }

        if (distance < GUARD_DISTANCE) guardOhagi(now);
        if (now >= nextAttackAt) startWarning(now);
        return;
    }

    if (phase === "warning") {
        if (characterDistance() < GUARD_DISTANCE) guardOhagi(now);
        stage.classList.toggle("perfect-window", phaseEndsAt - now <= 130);
        if (now >= phaseEndsAt) startCharge(now);
        return;
    }

    if (phase === "charging") {
        /*
         * 完全な直線ではなく、突進中も少しだけ義勇を追尾する。
         * 大きく回り込めば避けられるが、横へ少し動くだけでは当たりやすい。
         */
        const c = centers();
        const dx = c.gx - c.sx;
        const dy = c.gy - c.sy;
        const length = Math.max(1, Math.hypot(dx, dy));
        const desiredVX = dx / length * chargeSpeed;
        const desiredVY = dy / length * chargeSpeed;
        const steering = 1 - Math.exp(-CHARGE_HOMING * delta);
        chargeVX += (desiredVX - chargeVX) * steering;
        chargeVY += (desiredVY - chargeVY) * steering;

        sanemiX = clamp(sanemiX + chargeVX * delta, 8, m.sanemiMaxX);
        sanemiY = clamp(sanemiY + chargeVY * delta, m.minY, m.maxY);
        chargeNearest = Math.min(chargeNearest, characterDistance());

        if (characterDistance() <= HIT_DISTANCE) {
            receiveHit(now);
            return;
        }
        if (now >= phaseEndsAt) dodgeResult(now);
        return;
    }

    if (phase === "stunned") {
        if (characterDistance() <= FEED_DISTANCE) {
            feedOhagi(now);
            return;
        }
        if (now >= phaseEndsAt) {
            combo = 0;
            updateScoreUI();
            result.textContent = "実弥が立ち直った！";
            message.textContent = "また突進をかわして隙を作ろう";
            startRoaming(now, 360);
        }
    }
}

function updateTimer(now) {
    const remaining =
        Math.max(0, gameEndTime - now);

    /*
     * 残り10秒になった瞬間、一度だけ
     * FINAL演出とブチギレ状態を開始する。
     */
    if (
        remaining <= 10000 &&
        remaining > 0 &&
        !finalRushStarted
    ) {
        finalRushStarted = true;
        stage.classList.add("final-rush");
        finalRush.hidden = false;
        // 大きく叩きつけたあと、操作の邪魔になる前に消す
        window.setTimeout(() => {
            finalRush.hidden = true;
        }, 750);
        /*
 * 終盤はBGMのテンポと音程を上げる。
 * preservesPitchをfalseにすると、
 * 再生速度と一緒に音程も上がる。
 */
        if (
            soundEnabled &&
            !bgm.paused
        ) {
            bgm.preservesPitch = false;
            bgm.playbackRate = 1.08;
        }
    }

    timeDisplay.textContent =
        (remaining / 1000).toFixed(1);

    timeBar.style.width =
        `${remaining / GAME_DURATION * 100}%`;

    /*
     * 残り時間によって、
     * 緑 → 黄 → 赤へゲージの状態を変更する。
     */
    if (remaining <= 5000) {
        timeBar.dataset.state = "danger";
    } else if (remaining <= 15000) {
        timeBar.dataset.state = "warning";
    } else {
        timeBar.dataset.state = "safe";
    }

    clock.classList.toggle(
        "urgent",
        remaining <= 5000
    );

    if (remaining <= 0) {
        endGame();
    }
}

function update(now) {
    const delta = Math.min((now - lastTime) / 1000, .04);
    lastTime = now;

    if (gameStarted) {
        updateTimer(now);
        /*
         * updateTimer内でタイムアップした場合は、
         * そのフレームの攻撃・得点処理を続けない。
         */
        if (gameStarted) {
            const follow = 1 - Math.exp(-GIYU_FOLLOW * delta);
            giyuX += (targetGiyuX - giyuX) * follow;
            giyuY += (targetGiyuY - giyuY) * follow;
            updateSanemi(now, delta);
        }
    }

    draw();
    requestAnimationFrame(update);
}

function pointerTarget(event) {
    /*
     * 実弥に弾かれている0.34秒間は、
     * 指入力で押し戻し先を上書きしない。
     */
    if (
        performance.now() <
        guardPushUntil
    ) {
        return;
    }

    const rect = stage.getBoundingClientRect();
    const m = metrics();
    const touchOffset = event.pointerType === "touch" ? 34 : 0;
    targetGiyuX = clamp(
        event.clientX - rect.left - m.giyuWidth * .5,
        m.giyuMinX,
        m.giyuMaxX
    );
    targetGiyuY = clamp(
        event.clientY - rect.top - touchOffset,
        m.minY,
        m.maxY
    );
}

function beginControl(event) {
    // PCでは左ボタンだけを操作に使い、右クリックでは動かさない。
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    /*
     * ゲーム開始は下の開始ボタンだけで行う。
     * 待機中にステージを触っても開始しない。
     */
    if (!gameStarted) return;
    if (phase === "hit") return;
    controlActive = true;
    stage.classList.add("controlling");
    activePointerId = event.pointerId;
    pointerTarget(event);
    try {
        stage.setPointerCapture(event.pointerId);
    } catch {
        // pointer capture非対応でも操作できる。
    }
}

function moveControl(event) {
    if (!gameStarted || phase === "hit") return;

    /*
     * PCは左ボタンが物理的に押されている場合だけ追従する。
     * controlActiveが何らかの理由で残っても、ホバー移動にはならない。
     */
    if (
        event.pointerType === "mouse" &&
        (event.buttons & 1) !== 1
    ) {
        if (controlActive) endControl(event);
        return;
    }

    // PCもスマホも、押している間だけ動かす。
    if (!controlActive) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    event.preventDefault();
    pointerTarget(event);
}

function endControl(event) {
    if (activePointerId !== null && event?.pointerId !== undefined && event.pointerId !== activePointerId) return;
    controlActive = false;
    stage.classList.remove("controlling");
    activePointerId = null;
    // 指・ボタンを離した地点で義勇を止める。
    targetGiyuX = giyuX;
    targetGiyuY = giyuY;
}

function loadHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter(Number.isFinite) : [];
    } catch {
        return [];
    }
}

function saveResult() {
    const history = [...loadHistory(), points].sort((a, b) => b - a).slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    const best = Math.max(Number(localStorage.getItem(BEST_KEY) || 0), points);
    localStorage.setItem(BEST_KEY, String(best));
    bestDisplay.textContent = String(best);
    return { history, best };
}

function renderEnding() {
    const saved = saveResult();
    endingScore.textContent = String(points);
    endingScoreLabel.textContent = "点獲得！";
    endingDetails.textContent = "";
    endingDetails.hidden = true;
    endingRecord.textContent = `自己ベスト ${saved.best}点`;
    historyList.replaceChildren();
    saved.history.forEach((score, index) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${index + 1}位</span><strong>${score}</strong>`;
        historyList.appendChild(li);
    });
    ending.hidden = false;
    endingTitle.focus();

    /*
     * タイムアップ演出後、結果画面用の
     * 落ち着いたBGMへ切り替える。
     */
    if (soundEnabled) {
        resultBgm.currentTime = 0;

        resultBgm.play().catch(() => {
            // 再生できなくても結果画面は表示する
        });
    }
}

function endGame() {
    if (!gameStarted) return;
    gameStarted = false;
    document.body.classList.remove("is-playing");
    bgm.pause();
    bgm.currentTime = 0;
    playEffect(timeupSound);
    roundFinished = true;

    /*
     * PUSHの最終得点を匿名統計へ1回送信する。
     * endGame冒頭でgameStartedをfalseにするため、
     * endGameが再度呼ばれても二重送信されない。
     */
    reportAnonymousPlay("push", points);

    controlActive = false;
    activePointerId = null;
    window.clearTimeout(resetTimer);
    clearBattleClasses();
    effect.textContent = "";
    burst.textContent = "";
    timeDisplay.textContent = "0.0";
    timeBar.style.width = "0%";
    clock.classList.remove("urgent");
    giyuImage.src = "./images/giyu-normal.png";
    sanemiImage.src = "./images/sanemi-normal.png";
    result.textContent = `結果：${points}点！`;
    message.textContent = `おはぎは${ohagiCount}個食べさせた！`;
    action.disabled = false;
    action.textContent = "もう一度あそぶ！";
    finalRush.hidden = true;
    stage.classList.remove("final-rush");
    bgm.playbackRate = 1;
    timeUpFlash.hidden = false;
    /*
     * 再プレイ時に取り消せるよう、
     * 結果表示タイマーをresetTimerへ記録する。
     */
    resetTimer = window.setTimeout(() => {
        timeUpFlash.hidden = true;
        renderEnding();
    }, 1050);
}

function startGame() {
    resultBgm.pause();
    resultBgm.currentTime = 0;
    window.clearTimeout(resetTimer);
    ending.hidden = true;
    timeUpFlash.hidden = true;
    finalRushStarted = false;
    finalRush.hidden = true;
    stage.classList.remove("final-rush");
    hint.hidden = true;
    clearBattleClasses();
    stage.classList.add("free-motion");
    gameStarted = true;
    document.body.classList.add("is-playing");
    /*
 * 再挑戦でも曲の最初から再生する。
 */
    /*
     * 前回のBGMをいったん完全に停止してから、
     * 必ず曲の先頭へ戻す。
     */
    bgm.pause();
    bgm.currentTime = 0;
    bgm.playbackRate = 1;

    if (soundEnabled) {
        bgm.play().catch(() => {
            // 再生できなくてもゲームは継続
        });
    }
    /*
     * 前回のゲームの入力・攻撃状態をすべて初期化する。
     */
    roundFinished = false;
    controlActive = false;
    activePointerId = null;

    guardLockedUntil = 0;
    guardPushUntil = 0;

    doubleChargeQueued = false;
    secondCharge = false;

    phaseEndsAt = 0;
    nextAttackAt = 0;
    nextTurnAt = 0;
    chargeNearest = Infinity;

    points = 0;
    ohagiCount = 0;
    combo = 0;
    dodgeRank = "good";
    perfectCount = 0;
    justCount = 0;
    hitCount = 0;

    const now = performance.now();
    gameStartedAt = now;
    gameEndTime = now + GAME_DURATION;
    lastTime = now;
    resetCharacters(now);
    startRoaming(now, 800);
    updateScoreUI();
    effect.textContent = "";
    burst.textContent = "";
    result.textContent = "逃げる実弥を追え！";
    message.textContent = "押したまま、義勇を自由に動かせるよ";
    timeDisplay.textContent = "30.0";
    timeBar.style.width = "100%";
    timeBar.dataset.state = "safe";
    action.disabled = true;
    action.textContent = "プレイ中！";
}

action.addEventListener("click", startGame);
stage.addEventListener("pointerdown", beginControl);
stage.addEventListener("pointermove", moveControl, { passive: false });
window.addEventListener("pointerup", endControl);
window.addEventListener("pointercancel", endControl);

window.addEventListener("keydown", event => {
    if (!gameStarted) return;
    const m = metrics();
    const amount = event.shiftKey ? 70 : 38;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
    }
    if (event.key === "ArrowUp") targetGiyuY = clamp(targetGiyuY - amount, m.minY, m.maxY);
    if (event.key === "ArrowDown") targetGiyuY = clamp(targetGiyuY + amount, m.minY, m.maxY);
    if (event.key === "ArrowLeft") targetGiyuX = clamp(targetGiyuX - amount, m.giyuMinX, m.giyuMaxX);
    if (event.key === "ArrowRight") targetGiyuX = clamp(targetGiyuX + amount, m.giyuMinX, m.giyuMaxX);
});

window.addEventListener("resize", () => {
    const m = refreshMetrics();
    targetGiyuX = clamp(targetGiyuX, m.giyuMinX, m.giyuMaxX);
    targetGiyuY = clamp(targetGiyuY, m.minY, m.maxY);
    sanemiX = clamp(sanemiX, stage.clientWidth * .12, m.sanemiMaxX);
    sanemiY = clamp(sanemiY, m.minY, m.maxY);
    draw();
});

/*
 * 結果画面から待機画面へ戻す。
 * この時点では30秒タイマーを開始しない。
 */
function returnToReady() {
    document.body.classList.remove("is-playing");
    /*
 * 結果画面を閉じた時点で、
 * リザルトBGMも停止して先頭へ戻す。
 */
    resultBgm.pause();
    resultBgm.currentTime = 0;
    window.clearTimeout(resetTimer);

    gameStarted = false;
    roundFinished = false;
    controlActive = false;
    activePointerId = null;
    phase = "ready";

    ending.hidden = true;
    timeUpFlash.hidden = true;
    hint.hidden = false;

    clearBattleClasses();
    resetCharacters(performance.now());

    giyuImage.src = "./images/giyu-normal.png";
    sanemiImage.src = "./images/sanemi-normal.png";

    timeDisplay.textContent = "30.0";
    timeBar.style.width = "100%";
    timeBar.style.setProperty(
        "--time-color",
        "hsl(120 85% 47%)"
    );
    clock.classList.remove("urgent");

    result.textContent =
        "実弥をかわして、食べさせろ！";

    message.textContent =
        "開始ボタンを押して準備しよう！";

    action.disabled = false;
    action.textContent =
        "30秒チャレンジ、はじめる！";

    draw();
}

playAgain.addEventListener(
    "click",
    returnToReady
);

shareResult.addEventListener("click", () => {
    const text = `「おはぎを押しつけろ！」で${points}点！ おはぎ${ohagiCount}個！`;
    const url = "https://akamakimaki.github.io/ohagi-push/";
    open(`https://bsky.app/intent/compose?text=${encodeURIComponent(`${text}\n${url}`)}`, "_blank", "noopener");
});
privateSubmit.addEventListener("click", () => {
    /*
     * ゲーム終了後の得点を、
     * PUSH用ランキングへ引き渡す。
     */
    if (gameStarted || !roundFinished) return;

    const url =
        `${RANKING_BASE}/?game=push&view=mine&score=` +
        encodeURIComponent(points);

    window.location.href = url;
});
soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;

    soundButton.setAttribute(
        "aria-pressed",
        String(soundEnabled)
    );

    soundButton.textContent =
        soundEnabled
            ? "♪ 音 ON"
            : "♪ 音 OFF";

    if (!soundEnabled) {
        bgm.pause();
        resultBgm.pause();
        return;
    }

    /*
     * プレイ中にONへ戻した場合は、
     * その場からBGMを再開する。
     */
    if (gameStarted) {
        bgm.play().catch(() => {
            /* 再生できなくてもゲームは継続 */
        });
    } else if (!ending.hidden) {
        resultBgm.play().catch(() => {
            /* 再生できなくても結果画面は継続 */
        });
    }
});

bestDisplay.textContent = localStorage.getItem(BEST_KEY) || "0";
stage.classList.add("free-motion");
resetCharacters();
giyuImage.src = "./images/giyu-normal.png";
draw();
requestAnimationFrame(update);
