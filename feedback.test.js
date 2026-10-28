var assert = require('assert');
var Feedback = require('./feedback.js');

function at(y, m, d, hh, mm) {
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0);
}

var now = at(2026, 10, 28, 21, 0);

function rec(type, when, data, child) {
  return { child_id: child || 'c1', type: type, created_at: when.toISOString(), data: data || {} };
}

var pursuitShort = rec('pursuit', at(2026, 10, 28, 8, 0), { actual: 20, speed: 3, trajectory: 'h' });
var hartLow = rec('hart', at(2026, 10, 28, 9, 0), { actual: 45, correct: 1, wrong: 9 });
var hartLater = rec('hart', at(2026, 10, 28, 19, 0), { actual: 30, correct: 2, wrong: 0 });
var yesterday = rec('pursuit', at(2026, 10, 27, 23, 0), { actual: 600 });
var otherType = rec('peripheral', at(2026, 10, 28, 12, 0), { hit: 3 });
var badDate = { child_id: 'c1', type: 'pursuit', created_at: 'nope', data: { actual: 999 } };
var stringData = { child_id: 'c1', type: 'hart', created_at: at(2026, 10, 22, 10, 0).toISOString(), data: JSON.stringify({ actual: 120, correct: 4, wrong: 1 }) };

var records = [pursuitShort, hartLow, hartLater, yesterday, otherType, badDate, stringData];

var pursuitToday = Feedback.todayStatus(records, 'pursuit', now);
assert.strictEqual(pursuitToday.done, true, 'short pursuit check-in still counts as done');
assert.strictEqual(pursuitToday.seconds, 20);
assert.strictEqual(Feedback.fmtDuration(pursuitToday.seconds), '20 秒');

var hartToday = Feedback.todayStatus(records, 'hart', now);
assert.strictEqual(hartToday.done, true, 'low accuracy still counts as done');
assert.strictEqual(hartToday.seconds, 75, 'same-day sessions add duration');
assert.strictEqual(hartToday.correct, 3);
assert.strictEqual(hartToday.wrong, 9);
assert.ok(Math.abs(hartToday.accuracy - 3 / 12) < 1e-9);

assert.strictEqual(Feedback.todayStatus([yesterday], 'pursuit', now).done, false, 'yesterday is not today');
assert.strictEqual(Feedback.todayStatus([], 'hart', now).done, false);
assert.strictEqual(Feedback.todayStatus([otherType], 'pursuit', now).done, false);
assert.strictEqual(Feedback.todayStatus([badDate], 'pursuit', now).done, false);

var zeroJudge = Feedback.todayStatus([rec('hart', at(2026, 10, 28, 11, 0), { actual: 10, correct: 0, wrong: 0 })], 'hart', now);
assert.strictEqual(zeroJudge.done, true);
assert.strictEqual(zeroJudge.accuracy, null, 'no judgments leave accuracy empty, not 0%');

var days7 = Feedback.windowDays(7, now);
assert.strictEqual(days7.length, 7);
assert.strictEqual(days7[0].key, Feedback.dayKey(at(2026, 10, 22, 12, 0)));
assert.strictEqual(days7[6].key, Feedback.dayKey(now));
assert.strictEqual(days7[6].today, true);
assert.strictEqual(Feedback.windowDays(14, now).length, 14);

var hart7 = Feedback.bucket(records, 'hart', days7);
assert.strictEqual(hart7[0].done, true, 'Oct 22 string-data check-in is inside 7 days');
assert.strictEqual(hart7[0].accuracy, 0.8);
assert.strictEqual(hart7[6].accuracy, 0.25);

var grouped = Feedback.groupByChild([
  rec('pursuit', now, { actual: 1 }, 'a'),
  rec('hart', now, { actual: 1, correct: 1, wrong: 0 }, 'b')
]);
assert.strictEqual(grouped.a.length, 1);
assert.strictEqual(grouped.b[0].type, 'hart');

var parentHtml = Feedback.renderPanel({
  audience: 'parent',
  childName: '<小宇>',
  records: records,
  range: 7,
  hartMetric: 'duration',
  now: now
});
assert.ok(parentHtml.indexOf('今日作业已完成') >= 0);
assert.ok(parentHtml.indexOf('data-ex="pursuit" data-done="1"') >= 0);
assert.ok(parentHtml.indexOf('data-ex="hart" data-done="1"') >= 0);
assert.ok(parentHtml.indexOf('20 秒') >= 0);
assert.ok(parentHtml.indexOf('正确率/达标率 25%') >= 0);
assert.ok(parentHtml.indexOf('&lt;小宇&gt;') >= 0);
assert.strictEqual(parentHtml.indexOf('处方'), -1);
assert.strictEqual(parentHtml.indexOf('师傅'), -1);
assert.ok(parentHtml.indexOf('近 7 日') >= 0);
assert.ok(parentHtml.indexOf('近 14 日') >= 0);
assert.ok(parentHtml.indexOf('<polyline') >= 0);
assert.ok(parentHtml.indexOf('不单列正确率') >= 0);
assert.ok(parentHtml.indexOf('data-fb-metric="accuracy"') >= 0);

var missed = Feedback.renderPanel({
  audience: 'parent',
  childName: '小宇',
  records: [],
  range: 7,
  now: now
});
assert.ok(missed.indexOf('data-ex="pursuit" data-done="0"') >= 0);
assert.ok(missed.indexOf('data-ex="hart" data-done="0"') >= 0);
assert.ok(missed.indexOf('今日未完成') >= 0);
assert.strictEqual(missed.indexOf('今日作业已完成'), -1);
assert.strictEqual(missed.indexOf('<polyline'), -1);
assert.ok(missed.indexOf('还没有打卡') >= 0);
assert.ok(missed.indexOf('按视训师布置的练习') >= 0);
assert.ok(missed.indexOf('完成只看今天有没有打卡') >= 0);
assert.ok(missed.indexOf('>说明<') >= 0);
assert.ok(missed.indexOf('is-quiet') >= 0);
assert.ok(missed.indexOf('关于 / 帮助') >= 0);
assert.ok(missed.indexOf('fb-note-more') >= 0);
assert.strictEqual(missed.indexOf('处方'), -1);

var lowOnly = Feedback.renderPanel({
  audience: 'parent',
  childName: '小宇',
  records: [hartLow],
  range: 7,
  hartMetric: 'accuracy',
  now: now
});
assert.ok(lowOnly.indexOf('data-ex="hart" data-done="1"') >= 0);
assert.ok(lowOnly.indexOf('正确率/达标率 10%') >= 0);
assert.ok(lowOnly.indexOf('data-metric="accuracy"') >= 0);
assert.ok(lowOnly.indexOf('不挡完成') >= 0);
assert.ok(lowOnly.indexOf('data-day="' + Feedback.dayKey(now) + '"') >= 0);

var therapist = Feedback.renderPanel({
  audience: 'therapist',
  childName: '小宇',
  records: [pursuitShort],
  range: 14,
  now: now
});
assert.ok(therapist.indexOf('>完成<') >= 0);
assert.ok(therapist.indexOf('>未完成<') >= 0);
assert.ok(therapist.indexOf('10月28日') >= 0);
assert.ok(therapist.indexOf('fb-tab on" data-fb-range="14"') >= 0 || therapist.indexOf('data-fb-range="14"') >= 0);
assert.strictEqual(therapist.indexOf('今日作业已完成'), -1);
assert.strictEqual(therapist.indexOf('处方'), -1);
assert.strictEqual(therapist.indexOf('师傅'), -1);

var noJudgeHtml = Feedback.renderPanel({
  audience: 'parent',
  childName: '小宇',
  records: [rec('hart', at(2026, 10, 28, 11, 0), { actual: 5, correct: 0, wrong: 0 })],
  range: 7,
  hartMetric: 'accuracy',
  now: now
});
assert.ok(noJudgeHtml.indexOf('data-ex="hart" data-done="1"') >= 0);
assert.ok(noJudgeHtml.indexOf('这次没有对错记录') >= 0);
assert.ok(noJudgeHtml.indexOf('正确率/达标率先空着') >= 0);
assert.ok(noJudgeHtml.indexOf('data-metric="accuracy"') >= 0);
assert.strictEqual(noJudgeHtml.indexOf('<polyline'), -1);

var gapped = Feedback.renderPanel({
  audience: 'parent',
  childName: '小宇',
  records: [
    rec('hart', at(2026, 10, 22, 10, 0), { actual: 60, correct: 1, wrong: 1 }),
    rec('hart', at(2026, 10, 28, 10, 0), { actual: 60, correct: 3, wrong: 1 })
  ],
  range: 7,
  hartMetric: 'accuracy',
  now: now,
  showNote: false
});
var hartChart = gapped.split('data-chart="hart"')[1];
assert.ok(hartChart.indexOf('<polyline') >= 0, 'accuracy days connect into a line across gaps');
assert.strictEqual((hartChart.match(/data-day="/g) || []).length, 2);

var filled = [];
for (var i = 0; i < 14; i++) {
  filled.push(rec('pursuit', at(2026, 10, 28 - i, 10, 0), { actual: 60 }));
}
var wide = Feedback.renderPanel({ audience: 'therapist', records: filled, range: 14, now: now, showNote: false });
var dots = wide.match(/data-day="/g);
assert.strictEqual(dots && dots.length, 14);
var week = Feedback.renderPanel({ audience: 'therapist', records: filled, range: 7, now: now, showNote: false });
assert.strictEqual((week.match(/data-day="/g) || []).length, 7);

assert.ok(Feedback.noteText('parent').indexOf('不要求练满固定分钟') >= 0);
assert.strictEqual(Feedback.noteText('parent').indexOf('师傅'), -1);

var banned = ['师傅', '处方', '治疗', '治愈', '改善视力', '提高视力', '恢复视力', '开始训练', '闯关治好', '保证效果', '立竿见影'];
Object.keys(Feedback.PRACTICE_COPY).forEach(function (k) {
  var s = Feedback.PRACTICE_COPY[k];
  assert.strictEqual(typeof s, 'string', k);
  assert.ok(s.length > 0, k);
  banned.forEach(function (w) {
    assert.strictEqual(s.indexOf(w), -1, k + ' contains ' + w);
  });
});
assert.ok(Feedback.PRACTICE_COPY.doneTitle === '今日作业已完成');
assert.ok(Feedback.PRACTICE_COPY.hartReady.indexOf('不记成 0%') >= 0);
assert.ok(Feedback.PRACTICE_COPY.discomfort.indexOf('立即停止') >= 0);
assert.ok(Feedback.PRACTICE_COPY.start.indexOf('按视训师布置的练习') >= 0);

var shortPayload = Feedback.pursuitRecordData({ speed: 5, amp: 80, traj: 'hj', elapsed: 8.4 });
assert.strictEqual(shortPayload.actual, 8);
assert.strictEqual(shortPayload.trajectory, 'hj');
assert.strictEqual(Feedback.todayStatus([rec('pursuit', now, shortPayload)], 'pursuit', now).done, true);
assert.strictEqual(Feedback.todayStatus([rec('pursuit', now, shortPayload)], 'pursuit', now).seconds, 8);

var zeroPayload = Feedback.pursuitRecordData({ speed: 1, amp: 10, traj: 'h', elapsed: 0.2 });
assert.strictEqual(zeroPayload.actual, 0);
assert.strictEqual(Feedback.todayStatus([rec('pursuit', now, zeroPayload)], 'pursuit', now).done, true, 'zero seconds still counts as done');

var lowPayload = Feedback.hartRecordData({ charset: 'mix', perDir: 4, correct: 1, wrong: 9, elapsed: 12.6 });
assert.strictEqual(lowPayload.actual, 13);
assert.strictEqual(lowPayload.per_dir, 4);
assert.strictEqual(lowPayload.correct, 1);
assert.strictEqual(lowPayload.wrong, 9);
var lowStatus = Feedback.todayStatus([rec('hart', now, lowPayload)], 'hart', now);
assert.strictEqual(lowStatus.done, true, 'low accuracy still done');
assert.ok(Math.abs(lowStatus.accuracy - 0.1) < 1e-9);

var nonePayload = Feedback.hartRecordData({ correct: 0, wrong: 0, elapsed: 5 });
assert.strictEqual(nonePayload.correct, 0);
assert.strictEqual(nonePayload.wrong, 0);
var noneStatus = Feedback.todayStatus([rec('hart', now, nonePayload)], 'hart', now);
assert.strictEqual(noneStatus.done, true);
assert.strictEqual(noneStatus.accuracy, null);
var noneReport = Feedback.sessionReport('hart', nonePayload);
assert.strictEqual(noneReport.accuracy, null);
assert.strictEqual(noneReport.accuracyText, '这次没有对错记录');
assert.strictEqual(noneReport.durationText, '有效时长 5 秒');
assert.strictEqual(noneReport.accuracyText.indexOf('0%'), -1);

var allWrong = Feedback.hartRecordData({ correct: 0, wrong: 3, elapsed: 15 });
var wrongReport = Feedback.sessionReport('hart', allWrong);
assert.strictEqual(wrongReport.accuracy, 0);
assert.strictEqual(wrongReport.accuracyText, '正确率/达标率 0%');
assert.strictEqual(Feedback.todayStatus([rec('hart', now, allWrong)], 'hart', now).done, true);

assert.strictEqual(
  Feedback.recordCaption('pursuit', { trajectory: 'h', speed: 5, amp: 80, actual: 20 }),
  '追视小球 · 左右移动 · 5 档 · 摆幅 80% · 有效时长 20 秒'
);
assert.strictEqual(
  Feedback.recordCaption('hart', { correct: 0, wrong: 0, actual: 10 }),
  '哈特表 · 这次没有对错记录 · 有效时长 10 秒'
);
assert.ok(Feedback.recordCaption('hart', { correct: 1, wrong: 9, actual: 45 }).indexOf('正确率/达标率 10%') >= 0);
assert.strictEqual(Feedback.recordCaption('hart', { correct: 1, wrong: 9, actual: 45 }).indexOf('不记成 0%'), -1);
assert.ok(Feedback.recordCaption('pursuit', { trajectory: 'v', speed: 'slow', actual: 90 }).indexOf('有效时长 1 分 30 秒') >= 0);
assert.ok(Feedback.recordCaption('pursuit', { speed: 'slow', actual: 90 }).indexOf('慢速') >= 0);

var fs = require('fs');
var page = fs.readFileSync(require('path').join(__dirname, 'cloud.html'), 'utf8');
['结束训练', '退出训练', '训练完成', '打卡上传给视训师', '师傅'].forEach(function (s) {
  assert.strictEqual(page.indexOf(s), -1, 'cloud.html still has ' + s);
});
assert.ok(page.indexOf('PRACTICE_COPY') >= 0);
assert.ok(page.indexOf('pursuitRecordData') >= 0);
assert.ok(page.indexOf('hartRecordData') >= 0);
assert.strictEqual(page.indexOf('maximum-scale'), -1);
assert.strictEqual(page.indexOf('home-split'), -1);
assert.ok(page.indexOf('>去做<') >= 0);
assert.ok(page.indexOf('border:1.5px solid #f2a33c') >= 0);
assert.ok(page.indexOf('家庭辅助训练工具，非医疗器械；不诊断、不替代当面带练与医生；不作效果承诺；不适即停，听从视训师与医生。') >= 0);
var hang = fs.readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
assert.strictEqual(hang.indexOf('训练师'), -1, 'hang page still says 训练师');
assert.strictEqual(hang.indexOf('🧑‍⚕️'), -1, 'hang page still has the clinician emoji');
assert.ok(hang.indexOf('进入云端版') >= 0);
assert.ok(hang.indexOf('>演示<') >= 0);
assert.ok(hang.indexOf('href="app.html"') >= 0);
assert.ok(hang.indexOf('家庭辅助训练工具，非医疗器械；不诊断、不替代当面带练与医生；不作效果承诺；不适即停，听从视训师与医生。') >= 0);

var WX_HINT = '请点右上角 ··· → 在浏览器中打开';
assert.ok(page.indexOf(WX_HINT) >= 0, 'cloud login missing wechat hint');
assert.ok(page.indexOf('MicroMessenger') >= 0, 'cloud missing wechat ua check');
assert.ok(hang.indexOf(WX_HINT) >= 0, 'hang page missing wechat hint');
assert.ok(hang.indexOf('MicroMessenger') >= 0, 'hang page missing wechat ua check');
assert.strictEqual(page.indexOf('maximum-scale'), -1);
function sliceFn(src, startMark, endMark) {
  var start = src.indexOf(startMark);
  var end = src.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark);
  return src.slice(start, end);
}
assert.ok(sliceFn(page, 'async function signIn()', 'async function signOut()').indexOf('catch (e)') >= 0);
assert.ok(sliceFn(page, 'async function signUp()', 'async function signIn()').indexOf('catch (e)') >= 0);
assert.ok(sliceFn(page, 'async function init()', '})();').indexOf('getSession') >= 0);
assert.ok(sliceFn(page, 'async function init()', '})();').indexOf('catch (e)') >= 0);
assert.ok(sliceFn(page, 'async function signIn()', 'async function signOut()').indexOf('thrownAuthText') >= 0);

console.log('feedback.test.js ok');
