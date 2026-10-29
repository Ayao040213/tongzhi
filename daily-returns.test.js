var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Feedback = require('./feedback.js');

global.Feedback = Feedback;
var DailyReturns = require('./js/daily-returns.js');

function at(y, m, d, hh, mm) {
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0);
}

function rec(type, when, data, id) {
  return { id: id || type + '-' + when.getTime(), type: type, created_at: when.toISOString(), data: data || {}, media: [] };
}

var now = at(2026, 10, 29, 21, 0);
var todayKey = Feedback.dayKey(now);
var yesterdayKey = Feedback.dayKey(at(2026, 10, 28, 12, 0));
var emptyKey = Feedback.dayKey(at(2026, 10, 27, 12, 0));
var boundaryKey = Feedback.dayKey(at(2026, 10, 16, 8, 0));
var beforeKey = Feedback.dayKey(at(2026, 10, 15, 23, 0));
var futureKey = Feedback.dayKey(at(2026, 11, 1, 12, 0));

var pursuitToday = rec('pursuit', at(2026, 10, 29, 8, 0), { actual: 20, speed: 5, trajectory: 'h', amp: 80 }, 'p-today');
var hartToday = rec('hart', at(2026, 10, 29, 9, 30), { actual: 40, correct: 1, wrong: 1 }, 'h-today');
var eyeToday = rec('eye', at(2026, 10, 29, 18, 0), { stage: 'left' }, 'e-today');
eyeToday.media = ['child/eye.jpg'];
var pursuitYesterday = rec('pursuit', at(2026, 10, 28, 23, 0), { actual: 600, trajectory: 'v' }, 'p-yday');
var boundary = rec('marsden', at(2026, 10, 16, 8, 0), { slots: ['a', 'b'] }, 'm-bound');
var tooOld = rec('pursuit', at(2026, 10, 15, 23, 0), { actual: 5, trajectory: 'hj' }, 'p-old');
var badDate = { id: 'bad', type: 'pursuit', created_at: 'nope', data: { actual: 999 }, media: [] };
var stringHart = {
  id: 'h-str',
  type: 'hart',
  created_at: at(2026, 10, 22, 10, 0).toISOString(),
  data: JSON.stringify({ actual: 120, correct: 0, wrong: 0 }),
  media: '["clip.mp4"]'
};
var customNamed = rec('custom', at(2026, 10, 22, 11, 0), { custom_title: '<img>' }, 'c-named');

var records = [hartToday, tooOld, eyeToday, pursuitYesterday, pursuitToday, boundary, badDate, stringHart, customNamed];

function legacySince(when) {
  var since = new Date(when.getTime());
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 13);
  return since;
}

assert.strictEqual(DailyReturns.sinceIso(now), legacySince(now).toISOString());
assert.strictEqual(Feedback.dayKey(legacySince(now)), Feedback.windowDays(14, now)[0].key);
assert.strictEqual(DailyReturns.dayKey(now), todayKey);
assert.strictEqual(DailyReturns.inWindow(boundaryKey, now), true);
assert.strictEqual(DailyReturns.inWindow(todayKey, now), true);
assert.strictEqual(DailyReturns.inWindow(beforeKey, now), false);
assert.strictEqual(DailyReturns.inWindow(futureKey, now), false);

var state = DailyReturns.initialState(now);
assert.strictEqual(state.mode, 'week');
assert.strictEqual(state.selectedKey, todayKey);

function view(next) {
  return DailyReturns.render({ now: now, state: next, records: records });
}

function buttonCell(html, key) {
  var token = 'data-dr-day="' + key + '"';
  var i = html.indexOf(token);
  assert.ok(i >= 0, 'missing day button ' + key);
  var start = html.lastIndexOf('<button', i);
  var end = html.indexOf('</button>', i);
  assert.ok(start >= 0 && end > i, key);
  return html.slice(start, end);
}

var todayHtml = view(state);
assert.ok(todayHtml.indexOf('>每日回传<') >= 0);
assert.strictEqual((todayHtml.match(/每日回传/g) || []).length, 1);
assert.ok(todayHtml.indexOf('展开月历') >= 0);
assert.strictEqual(todayHtml.indexOf('收起月历'), -1);
assert.ok(todayHtml.indexOf('dr-week') >= 0);
assert.strictEqual(todayHtml.indexOf('class="dr-month"'), -1);
assert.strictEqual((todayHtml.match(/data-dr-key="/g) || []).length, 7);
assert.ok(buttonCell(todayHtml, todayKey).indexOf('is-on') >= 0);
assert.ok(buttonCell(todayHtml, todayKey).indexOf('aria-pressed="true"') >= 0);
assert.ok(buttonCell(todayHtml, todayKey).indexOf('>今<') >= 0);
assert.ok(buttonCell(todayHtml, todayKey).indexOf('class="dr-dot"') >= 0);
assert.ok(todayHtml.indexOf('3 条回传 · 2 项作业相关') >= 0);
assert.ok(todayHtml.indexOf('追视小球') >= 0);
assert.ok(todayHtml.indexOf('有效时长 20 秒') >= 0);
assert.ok(todayHtml.indexOf('正确率/达标率 50%') >= 0);
assert.ok(todayHtml.indexOf('眼位照 · 左眼') >= 0);
assert.ok(todayHtml.indexOf('08:00') >= 0);
assert.ok(todayHtml.indexOf('09:30') >= 0);
assert.ok(todayHtml.indexOf('18:00') >= 0);
assert.ok(todayHtml.indexOf('08:00') < todayHtml.indexOf('09:30'));
assert.ok(todayHtml.indexOf('09:30') < todayHtml.indexOf('18:00'));
assert.strictEqual(todayHtml.indexOf('有效时长 10 分钟'), -1, 'yesterday stays off today list');
assert.strictEqual(todayHtml.indexOf('这一天还没有回传'), -1);
assert.ok(todayHtml.indexOf('fb-badge done') >= 0);
var eyeCell = todayHtml.split('data-dr-rec="e-today"')[1].split('data-dr-rec=')[0];
assert.strictEqual(eyeCell.indexOf('fb-badge'), -1);
assert.strictEqual(todayHtml.indexOf('data-dr-day="' + futureKey + '"'), -1);
assert.ok(todayHtml.indexOf('data-dr-key="' + futureKey + '"') >= 0);
assert.strictEqual(todayHtml.indexOf('看回传'), -1);
assert.strictEqual(todayHtml.indexOf('今日回传'), -1);
assert.strictEqual(todayHtml.indexOf('stage-tab'), -1);
assert.strictEqual(todayHtml.indexOf('data-fb-range'), -1);
assert.strictEqual(todayHtml.indexOf('师傅'), -1);

var yesterday = DailyReturns.reduce(state, { type: 'select', key: yesterdayKey }, now);
assert.strictEqual(yesterday.selectedKey, yesterdayKey);
var yHtml = view(yesterday);
assert.ok(buttonCell(yHtml, yesterdayKey).indexOf('aria-pressed="true"') >= 0);
assert.ok(buttonCell(yHtml, todayKey).indexOf('aria-pressed="false"') >= 0);
assert.ok(buttonCell(yHtml, yesterdayKey).indexOf('class="dr-dot"') >= 0);
assert.ok(yHtml.indexOf('1 条回传 · 1 项作业相关') >= 0);
assert.ok(yHtml.indexOf('有效时长 10 分钟') >= 0);
assert.strictEqual(yHtml.indexOf('眼位照'), -1);
assert.strictEqual(yHtml.indexOf('有效时长 20 秒'), -1);

var empty = DailyReturns.reduce(state, { type: 'select', key: emptyKey }, now);
var emptyHtml = view(empty);
assert.ok(emptyHtml.indexOf('0 条回传') >= 0);
assert.ok(emptyHtml.indexOf('这一天还没有回传') >= 0);
assert.ok(emptyHtml.indexOf('fb-empty') >= 0);
assert.strictEqual(emptyHtml.indexOf('list-item'), -1);
assert.ok(buttonCell(emptyHtml, emptyKey).indexOf('dr-dot is-off') >= 0);
assert.strictEqual(emptyHtml.indexOf('师傅'), -1);

var blocked = DailyReturns.reduce(state, { type: 'select', key: beforeKey }, now);
assert.strictEqual(blocked.selectedKey, todayKey, 'days outside the 14-day window are not selectable');

var month = DailyReturns.reduce(state, { type: 'toggle' }, now);
assert.strictEqual(month.mode, 'month');
var monthHtml = view(month);
assert.ok(monthHtml.indexOf('收起月历') >= 0);
assert.ok(monthHtml.indexOf('class="dr-month"') >= 0);
assert.ok(monthHtml.indexOf('>一<') >= 0);
assert.ok(buttonCell(monthHtml, boundaryKey).indexOf('data-dr-day="' + boundaryKey + '"') >= 0);
assert.strictEqual(monthHtml.indexOf('data-dr-day="' + beforeKey + '"'), -1);

var novNow = at(2026, 11, 3, 12, 0);
var novState = DailyReturns.reduce(DailyReturns.initialState(novNow), { type: 'toggle' }, novNow);
var novHtml = DailyReturns.render({ now: novNow, state: novState, records: [] });
assert.ok(novHtml.indexOf('>上月<') >= 0);
assert.strictEqual(novHtml.indexOf('>下月<'), -1);
var octState = DailyReturns.reduce(novState, { type: 'month', delta: -1 }, novNow);
var oct21 = Feedback.dayKey(at(2026, 10, 21, 12, 0));
var octHtml = DailyReturns.render({ now: novNow, state: octState, records: [] });
assert.ok(octHtml.indexOf('2026年10月') >= 0);
assert.ok(octHtml.indexOf('>下月<') >= 0);
assert.ok(buttonCell(octHtml, oct21).indexOf('data-dr-day="' + oct21 + '"') >= 0);

var titles = DailyReturns.recordTitle(stringHart);
assert.ok(titles.indexOf('这次没有对错记录') >= 0);
assert.strictEqual(DailyReturns.recordTitle(customNamed), '自定义训练 · <img>');
assert.ok(view(DailyReturns.reduce(state, { type: 'select', key: Feedback.dayKey(at(2026, 10, 22, 12, 0)) }, now)).indexOf('自定义训练 · &lt;img&gt;') >= 0);
assert.strictEqual(DailyReturns.recordTitle(boundary), '马斯登球 · 2 段视频');
var paths = DailyReturns.mediaPaths(stringHart);
assert.deepStrictEqual(paths.media, ['clip.mp4']);
var withOrig = { data: JSON.stringify({ originals: ['raw.mp4'] }), media: [] };
assert.deepStrictEqual(DailyReturns.mediaPaths(withOrig).originals, ['raw.mp4']);

var src = fs.readFileSync(path.join(__dirname, 'js/daily-returns.js'), 'utf8');
['师傅', '治疗', '治愈', '改善视力', '提高视力'].forEach(function (w) {
  assert.strictEqual(src.indexOf(w), -1, w);
});

var page = fs.readFileSync(path.join(__dirname, 'cloud.html'), 'utf8');
assert.ok(page.indexOf('src="js/daily-returns.js"') >= 0);
assert.strictEqual(page.indexOf('今日回传'), -1);
assert.strictEqual(page.indexOf('看回传'), -1);
assert.strictEqual(page.indexOf('onclick="openChildType'), -1);
assert.ok(page.indexOf('async function openChildType(') >= 0, 'type route stays, unlinked from archive home');
assert.ok(page.indexOf('今日完成') >= 0, 'parent today-complete block stays');
assert.ok(page.indexOf('.dr-day.is-on{ background:#eef4f6;') >= 0);
assert.ok(page.indexOf('.dr-dot{ width:4px; height:4px; border-radius:50%; background:var(--muted); opacity:.35;') >= 0);
assert.ok(page.indexOf('.fb-empty{ background:#f7fafb; border:1px dashed var(--line);') >= 0);

function sliceFn(text, startMark, endMark) {
  var start = text.indexOf(startMark);
  var end = text.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark);
  return text.slice(start, end);
}

var openChildSrc = sliceFn(page, 'async function openChild(', 'async function openChildType(');
assert.strictEqual(openChildSrc.indexOf('看回传'), -1);
assert.strictEqual(openChildSrc.indexOf('今日回传'), -1);
assert.strictEqual(openChildSrc.indexOf('openChildType'), -1);
assert.ok(openChildSrc.indexOf('id="daily-returns"') >= 0);
assert.ok(openChildSrc.indexOf('loadDailyReturns(cid)') >= 0);
assert.strictEqual(openChildSrc.indexOf('id="fb-child"'), -1);

var loadSrc = sliceFn(page, 'async function loadDailyReturns(', 'document.addEventListener');
assert.ok(loadSrc.indexOf(".gte('created_at', feedbackSinceIso())") >= 0);
assert.strictEqual(loadSrc.indexOf(".in('type'"), -1);
assert.ok(sliceFn(page, 'function feedbackSinceIso()', 'async function loadLockedRecords').indexOf('setDate(since.getDate() - 13)') >= 0);
assert.ok(page.indexOf("DailyReturns.reduce") >= 0);
assert.ok(page.indexOf("type: 'select'") >= 0);
assert.ok(page.indexOf('deleteRecord(del.getAttribute') >= 0);
assert.strictEqual(page.indexOf('id="mod-list"'), -1);

console.log('daily-returns.test.js ok');
