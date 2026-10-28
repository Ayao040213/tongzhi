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

console.log('feedback.test.js ok');
