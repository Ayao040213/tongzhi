/* 回传最小版（M2）
 * 完成：当日该孩子该练习有成功打卡记录即完成。有效时长、正确率不挡完成，不设练满分钟门槛。
 * 曲线：近 7 / 14 日。纵轴默认有效时长（data.actual 秒）。哈特可切正确率/达标率 = 答对÷(答对+答错)。
 * 追视是时长型，本月不单列正确率。不改 records 表。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Feedback = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var LOCKED = [
    { key: 'pursuit', label: '追视小球', icon: '👀' },
    { key: 'hart', label: '哈特表', icon: '🎯' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isNum(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function recordData(r) {
    var d = r && r.data;
    if (!d) return {};
    if (typeof d === 'string') {
      try { return JSON.parse(d) || {}; } catch (e) { return {}; }
    }
    return d;
  }

  function asDate(input) {
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
    var d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  function dayKey(input) {
    var d = asDate(input);
    if (!d) return '';
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function windowDays(n, now) {
    var count = n === 14 ? 14 : (n === 1 ? 1 : 7);
    var end = startOfLocalDay(now || new Date());
    var days = [];
    for (var i = count - 1; i >= 0; i--) {
      var d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
      days.push({
        key: dayKey(d),
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        today: i === 0
      });
    }
    return days;
  }

  function fmtDuration(seconds) {
    var s = Math.round(isNum(seconds) ? seconds : 0);
    if (s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (m <= 0) return r + ' 秒';
    if (r === 0) return m + ' 分钟';
    return m + ' 分 ' + r + ' 秒';
  }

  function pct(ratio) {
    return Math.round(ratio * 100) + '%';
  }

  function fmtDayCN(d) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function bucket(records, type, days) {
    var map = {};
    for (var i = 0; i < days.length; i++) {
      var day = days[i];
      map[day.key] = {
        key: day.key,
        label: day.label,
        today: !!day.today,
        done: false,
        seconds: 0,
        correct: 0,
        wrong: 0,
        sessions: 0,
        accuracy: null
      };
    }
    var list = records || [];
    for (var j = 0; j < list.length; j++) {
      var rec = list[j];
      if (!rec || rec.type !== type) continue;
      var when = asDate(rec.created_at);
      if (!when) continue;
      var slot = map[dayKey(when)];
      if (!slot) continue;
      slot.done = true;
      slot.sessions += 1;
      var data = recordData(rec);
      var actual = Number(data.actual);
      if (isNum(actual) && actual > 0) slot.seconds += actual;
      if (type === 'hart') {
        var correct = Number(data.correct);
        var wrong = Number(data.wrong);
        if (isNum(correct) && correct > 0) slot.correct += correct;
        if (isNum(wrong) && wrong > 0) slot.wrong += wrong;
      }
    }
    for (var k = 0; k < days.length; k++) {
      var b = map[days[k].key];
      var total = b.correct + b.wrong;
      b.accuracy = total > 0 ? b.correct / total : null;
    }
    return days.map(function (d) { return map[d.key]; });
  }

  function todayStatus(records, type, now) {
    return bucket(records, type, windowDays(1, now))[0];
  }

  function groupByChild(records) {
    var map = {};
    var list = records || [];
    for (var i = 0; i < list.length; i++) {
      var id = list[i] && list[i].child_id;
      if (!id) continue;
      if (!map[id]) map[id] = [];
      map[id].push(list[i]);
    }
    return map;
  }

  function badgeText(done, audience) {
    if (audience === 'therapist') return done ? '完成' : '未完成';
    return done ? '今日作业已完成' : '今日未完成';
  }

  function noteText(audience) {
    if (audience === 'therapist') {
      return '完成只看今天有没有打卡。有效时长、正确率/达标率用来看练得怎么样，方便调任务，不挡完成，也不要求练满固定分钟。';
    }
    return '完成只看今天有没有打卡。有效时长、正确率/达标率画在曲线里，短时长或低正确率也算完成，不要求练满固定分钟。';
  }

  function auxText(day, type) {
    if (!day.done) return '今天还没有打卡';
    var parts = ['有效时长 ' + fmtDuration(day.seconds)];
    if (type === 'hart') {
      parts.push(day.accuracy == null ? '这次没有对错记录' : ('正确率/达标率 ' + pct(day.accuracy)));
    }
    return parts.join(' · ');
  }

  function emptyCopy(metric, range, audience) {
    var win = '近 ' + range + ' 日';
    if (metric === 'accuracy') {
      return win + '没有对错记录，正确率/达标率先空着。是否完成仍只看有没有打卡。';
    }
    if (audience === 'parent') {
      return win + '还没有打卡。按视训师布置的练习做完并打卡后，这里会显示曲线。';
    }
    return win + '还没有打卡。家长打卡后，这里会显示曲线。';
  }

  function summaryText(series, metric) {
    var last = series[series.length - 1];
    var span = series.length;
    if (metric === 'accuracy') {
      var known = 0;
      for (var i = 0; i < series.length; i++) if (series[i].accuracy != null) known += 1;
      var todayTxt = last.accuracy == null ? '今日没有对错记录' : ('今日 ' + pct(last.accuracy));
      return todayTxt + ' · 近 ' + span + ' 日有正确率的 ' + known + ' 天';
    }
    var doneDays = 0;
    for (var j = 0; j < series.length; j++) if (series[j].done) doneDays += 1;
    var todayDur = last.done ? ('今日 ' + fmtDuration(last.seconds)) : '今日未打卡';
    return todayDur + ' · 近 ' + span + ' 日有打卡 ' + doneDays + ' 天';
  }

  function hasChartData(series, metric) {
    for (var i = 0; i < series.length; i++) {
      if (metric === 'accuracy') {
        if (series[i].accuracy != null) return true;
      } else if (series[i].done) return true;
    }
    return false;
  }

  function niceMax(max) {
    if (!(max > 0)) return 1;
    var exp = Math.floor(Math.log10(max));
    var pow = Math.pow(10, exp);
    var n = max / pow;
    var nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  function formatAxis(v, metric) {
    if (metric === 'accuracy') return Math.round(v * 100) + '%';
    var rounded = Math.round(v * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded));
    return String(rounded);
  }

  function showTick(i, n) {
    if (n <= 7) return true;
    if (i === n - 1) return true;
    if ((n - 1 - i) < 2) return false;
    return i % 2 === 0;
  }

  function metricValue(day, metric) {
    if (metric === 'accuracy') return day.accuracy;
    return day.done ? day.seconds / 60 : 0;
  }

  function lineChart(series, metric) {
    var W = 360, H = 176;
    var padL = 42, padR = 14, padT = 18, padB = 30;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var vals = [];
    for (var i = 0; i < series.length; i++) vals.push(metricValue(series[i], metric));
    var yMax = metric === 'accuracy' ? 1 : niceMax(maxOf(vals));
    var n = vals.length;
    var stroke = metric === 'accuracy' ? '#1f7a4d' : '#1a7a8c';
    function xAt(i) {
      if (n === 1) return padL + innerW / 2;
      return padL + innerW * i / (n - 1);
    }
    function yAt(v) {
      return padT + innerH * (1 - (v / yMax));
    }
    var html = '';
    var ticks = [0, yMax / 2, yMax];
    for (var t = 0; t < ticks.length; t++) {
      var yy = round1(yAt(ticks[t]));
      html += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#e3ebef" stroke-width="1"></line>';
      html += '<text x="' + (padL - 6) + '" y="' + yy + '" text-anchor="end" dominant-baseline="middle" fill="#5a6b74" font-size="11">' + esc(formatAxis(ticks[t], metric)) + '</text>';
    }
    // 空档不落点，但已有的点按时间连成一条线，避免只剩散点。
    var seg = [];
    for (var p = 0; p < n; p++) {
      var v = vals[p];
      if (v == null || !isFinite(v)) continue;
      seg.push(round1(xAt(p)) + ',' + round1(yAt(v)));
    }
    if (seg.length >= 2) {
      html += '<polyline fill="none" stroke="' + stroke + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + seg.join(' ') + '"></polyline>';
    }
    for (var c = 0; c < n; c++) {
      var day = series[c];
      var point = vals[c];
      var showDot = metric === 'accuracy' ? point != null : day.done;
      if (!showDot || point == null || !isFinite(point)) continue;
      var tip = day.label + ' ' + (metric === 'accuracy' ? ('正确率/达标率 ' + pct(point)) : ('有效时长 ' + fmtDuration(day.seconds)));
      var fill = day.today ? '#f2a33c' : '#fff';
      html += '<circle data-day="' + esc(day.key) + '" cx="' + round1(xAt(c)) + '" cy="' + round1(yAt(point)) + '" r="3.5" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"><title>' + esc(tip) + '</title></circle>';
    }
    for (var x = 0; x < n; x++) {
      if (!showTick(x, n)) continue;
      var fillLabel = series[x].today ? '#1a7a8c' : '#5a6b74';
      var weight = series[x].today ? '700' : '400';
      html += '<text x="' + round1(xAt(x)) + '" y="' + (H - 10) + '" text-anchor="middle" fill="' + fillLabel + '" font-size="11" font-weight="' + weight + '">' + esc(series[x].label) + '</text>';
    }
    return html;
  }

  function maxOf(vals) {
    var m = 0;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] != null && isFinite(vals[i]) && vals[i] > m) m = vals[i];
    }
    return m;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function chartBlock(ex, series, metric, range, audience) {
    var title = ex.icon + ' ' + ex.label + (metric === 'accuracy' ? ' · 正确率/达标率' : ' · 有效时长');
    var head = '<div class="fb-chart-head"><div class="t">' + title + '</div>';
    if (ex.key === 'hart') {
      head += '<div class="fb-metric">' +
        '<button type="button" class="fb-tab' + (metric === 'duration' ? ' on' : '') + '" data-fb-metric="duration">有效时长</button>' +
        '<button type="button" class="fb-tab' + (metric === 'accuracy' ? ' on' : '') + '" data-fb-metric="accuracy">正确率/达标率</button>' +
        '</div>';
    }
    head += '</div>';
    var body;
    if (!hasChartData(series, metric)) {
      body = '<div class="fb-empty">' + esc(emptyCopy(metric, range, audience)) + '</div>';
    } else {
      var sum = summaryText(series, metric);
      var described = title + '。' + sum;
      body = '<svg class="fb-chart" viewBox="0 0 360 176" role="img" aria-label="' + esc(described) + '">' +
        lineChart(series, metric) + '</svg>' +
        '<p class="fb-sum">' + esc(sum) + '</p>';
      if (ex.key === 'pursuit') {
        body += '<p class="fb-cap">追视小球本月看有效时长，不单列正确率。</p>';
      } else if (metric === 'accuracy') {
        body += '<p class="fb-cap">正确率/达标率 = 答对 ÷（答对 + 答错）。只供查看，不挡完成。</p>';
      }
    }
    return '<div class="fb-chart-block" data-chart="' + ex.key + '" data-metric="' + metric + '">' + head + body + '</div>';
  }

  function renderPanel(opts) {
    opts = opts || {};
    var audience = opts.audience === 'therapist' ? 'therapist' : 'parent';
    var now = opts.now || new Date();
    var range = opts.range === 14 ? 14 : 7;
    var hartMetric = opts.hartMetric === 'accuracy' ? 'accuracy' : 'duration';
    var records = opts.records || [];
    var days = windowDays(range, now);
    var html = '';
    if (audience === 'parent') {
      html += '<div class="fb-child">' + esc(opts.childName || '孩子') + '</div>';
    }
    if (opts.showNote !== false) html += '<p class="fb-note">' + esc(noteText(audience)) + '</p>';
    for (var i = 0; i < LOCKED.length; i++) {
      var ex = LOCKED[i];
      var todayDays = windowDays(1, now);
      var today = bucket(records, ex.key, todayDays)[todayDays.length - 1];
      var sub = auxText(today, ex.key);
      if (audience === 'therapist') sub = fmtDayCN(now) + ' · ' + sub;
      html += '<div class="fb-row" data-ex="' + ex.key + '" data-done="' + (today.done ? '1' : '0') + '">' +
        '<span class="fb-icon" aria-hidden="true">' + ex.icon + '</span>' +
        '<div class="fb-main"><div class="t">' + ex.label + '</div><div class="s">' + esc(sub) + '</div></div>' +
        '<span class="fb-badge ' + (today.done ? 'done' : 'todo') + '">' + esc(badgeText(today.done, audience)) + '</span>' +
        '</div>';
    }
    html += '<div class="fb-switch">' +
      '<button type="button" class="fb-tab' + (range === 7 ? ' on' : '') + '" data-fb-range="7">近 7 日</button>' +
      '<button type="button" class="fb-tab' + (range === 14 ? ' on' : '') + '" data-fb-range="14">近 14 日</button>' +
      '</div>';
    for (var c = 0; c < LOCKED.length; c++) {
      var item = LOCKED[c];
      var metric = item.key === 'hart' ? hartMetric : 'duration';
      html += chartBlock(item, bucket(records, item.key, days), metric, range, audience);
    }
    return html;
  }

  return {
    LOCKED: LOCKED,
    dayKey: dayKey,
    windowDays: windowDays,
    bucket: bucket,
    todayStatus: todayStatus,
    groupByChild: groupByChild,
    badgeText: badgeText,
    noteText: noteText,
    fmtDuration: fmtDuration,
    renderPanel: renderPanel,
    emptyCopy: emptyCopy
  };
});
