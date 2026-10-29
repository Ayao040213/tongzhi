/* 回传最小版（M2）+ 两门练习的打卡口径（M4）
 * 家长完成态跟「当日布置」走：没有当天视训师布置 → 「等待视训师布置」，打卡和回传不放行。
 * 有当天布置时，只认布置之后、对得上当日项目的打卡。有效时长、正确率不挡完成，不设练满分钟门槛。
 * 不传布置时（视训师回传曲线）仍按当日有没有打卡。曲线：近 7 / 14 日，纵轴默认有效时长（data.actual 秒）。
 * 哈特可切正确率/达标率 = 答对÷(答对+答错)。没有对错记录时正确率留空，不记成 0%。追视是时长型，本月不单列正确率。不改 records 表。
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

  // 与 B 端 saveRx 的 title 一致：2026年10月29日（月、日不补零）。
  var WAIT_COPY = '等待视训师布置';
  var GAME_KEYS = { pursuit: 1, hart: 1 };
  var RETURN_KEYS = { eye: 1, marsden: 1, peripheral: 1 };

  function todayTitle(now) {
    var d = asDate(now) || new Date();
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function asRxList(prescriptions) {
    if (Array.isArray(prescriptions)) return prescriptions;
    if (prescriptions && typeof prescriptions === 'object') return [prescriptions];
    return [];
  }

  function rxItems(p) {
    if (!p) return [];
    var items = p.items != null ? p.items : p.projects;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (e) { return []; }
    }
    if (!Array.isArray(items)) return [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].key) out.push(items[i]);
    }
    return out;
  }

  function rxHas(p, key) {
    var items = rxItems(p);
    for (var i = 0; i < items.length; i++) if (items[i].key === key) return true;
    return false;
  }

  function rxStamp(p) {
    if (!p) return null;
    return asDate(p.created_at != null ? p.created_at : p.created);
  }

  // 当天布置 = title/date 等于本地今日中文日期的最新一条（同孩子）。
  function todayPrescription(prescriptions, childId, now) {
    var title = todayTitle(now || new Date());
    var list = asRxList(prescriptions);
    var best = null;
    var bestTs = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      if (childId && p.child_id && p.child_id !== childId) continue;
      var t = String(p.title != null ? p.title : (p.date != null ? p.date : '')).trim();
      if (t !== title) continue;
      var created = rxStamp(p);
      var ts = created ? created.getTime() : 0;
      if (!best || ts >= bestTs) { best = p; bestTs = ts; }
    }
    return best;
  }

  function hasCheckinForRx(records, type, childId, rx, now) {
    var today = dayKey(now || new Date());
    var since = rxStamp(rx);
    var sinceMs = since ? since.getTime() : null;
    var list = records || [];
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      if (!rec || rec.type !== type) continue;
      if (childId && rec.child_id && rec.child_id !== childId) continue;
      var when = asDate(rec.created_at);
      if (!when || dayKey(when) !== today) continue;
      if (sinceMs != null && when.getTime() < sinceMs) continue;
      return true;
    }
    return false;
  }

  function parentTasks(prescriptions, childId, now) {
    var rx = todayPrescription(prescriptions, childId, now);
    if (!rx) return { waiting: true, message: WAIT_COPY, offline: [], games: [], prescription: null };
    var items = rxItems(rx);
    var offline = [];
    var games = [];
    for (var i = 0; i < items.length; i++) {
      var key = items[i].key;
      if (GAME_KEYS[key]) games.push(key);
      else if (RETURN_KEYS[key]) offline.push(key);
    }
    return { waiting: false, message: '', offline: offline, games: games, prescription: rx };
  }

  function uploadGate(prescriptions, childId, kind, now) {
    if (kind === 'custom') return { allowed: true, waiting: false, message: '' };
    if (prescriptions == null) return { allowed: false, waiting: false, message: '' };
    var tasks = parentTasks(prescriptions, childId, now);
    if (tasks.waiting) return { allowed: false, waiting: true, message: WAIT_COPY };
    if (!kind) return { allowed: true, waiting: false, message: '' };
    var keys = tasks.offline.concat(tasks.games);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === kind) return { allowed: true, waiting: false, message: '' };
    }
    return { allowed: false, waiting: false, message: '' };
  }

  function parentRxGate(stateObj, childId, kind, now) {
    var prescriptions = [];
    if (stateObj && Object.prototype.hasOwnProperty.call(stateObj, 'prescriptions')) {
      prescriptions = stateObj.prescriptions;
    }
    return uploadGate(prescriptions, childId, kind, now || new Date());
  }

  function rxDomId(id) {
    var s = String(id == null ? '' : id);
    return /^[A-Za-z0-9-]+$/.test(s) ? s : '';
  }

  function renderParentRxList(children, prescriptions, now) {
    var kids = children || [];
    var html = '';
    var clock = now || new Date();
    if (!kids.length) {
      return '<div class="fb-empty" data-rx-wait="1">' + esc(WAIT_COPY) + '</div>';
    }
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (!kid || !kid.id) continue;
      var name = kid.name || '孩子';
      var rx = todayPrescription(prescriptions, kid.id, clock);
      if (!rx) {
        html += '<div class="list-item" data-rx-wait="1" data-child="' + esc(kid.id) + '">' +
          '<span class="icon">📋</span>' +
          '<div><div class="t">' + esc(name) + '</div>' +
          '<div class="s">' + esc(WAIT_COPY) + '</div></div></div>';
        continue;
      }
      var titles = rxItems(rx).map(function (x) { return x.title || x.key; }).join(' / ');
      var id = rxDomId(rx.id);
      var btn = id
        ? '<button type="button" class="btn btn-primary btn-small" onclick="viewRx(\'' + id + '\')">去做</button>'
        : '';
      html += '<div class="list-item" data-rx-today="1" data-child="' + esc(kid.id) + '">' +
        '<span class="icon">📋</span>' +
        '<div><div class="t">' + esc(name) + ' · ' + esc(rx.title || '今日作业') + '</div>' +
        '<div class="s">' + esc(titles) + '</div></div>' +
        btn + '</div>';
    }
    return html;
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

  function todayStatus(records, type, now, prescriptions, childId) {
    var base = bucket(records, type, windowDays(1, now))[0];
    // 不传布置：视训师曲线 / 旧口径，当日有打卡即完成。
    if (arguments.length < 4) return base;
    var rx = todayPrescription(prescriptions, childId, now);
    var assigned = !!(rx && rxHas(rx, type));
    return {
      key: base.key,
      label: base.label,
      today: base.today,
      done: assigned ? hasCheckinForRx(records, type, childId, rx, now) : false,
      seconds: base.seconds,
      correct: base.correct,
      wrong: base.wrong,
      sessions: base.sessions,
      accuracy: base.accuracy,
      waiting: !rx,
      assigned: assigned,
      uploadAllowed: assigned
    };
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

  function badgeText(done, audience, status) {
    if (status && status.waiting && audience !== 'therapist') return WAIT_COPY;
    if (audience === 'therapist') return done ? '完成' : '未完成';
    return done ? '今日作业已完成' : '今日未完成';
  }

  function noteText(audience) {
    if (audience === 'therapist') {
      return '完成只看今天有没有打卡。有效时长、正确率/达标率用来看练得怎么样，方便调任务，不挡完成，也不要求练满固定分钟。';
    }
    return '完成只看今天有没有打卡。有效时长、正确率/达标率画在曲线里，短时长或低正确率也算完成，不要求练满固定分钟。';
  }

  function noteShort() {
    return '完成只看今天有没有打卡。';
  }

  function noteDetail(audience) {
    var full = noteText(audience);
    var short = noteShort();
    if (full.indexOf(short) === 0) return full.slice(short.length).replace(/^\s+/, '');
    return full;
  }

  function noteBlock(audience) {
    return '<p class="fb-note">' + esc(noteShort()) +
      ' <button type="button" class="linkbtn fb-note-toggle" aria-expanded="false">说明</button></p>' +
      '<p class="fb-note-more" hidden>' + esc(noteDetail(audience)) + '</p>';
  }

  function auxText(day, type) {
    if (!day.done) return '今天还没有打卡';
    var parts = ['有效时长 ' + fmtDuration(day.seconds)];
    if (type === 'hart') {
      parts.push(day.accuracy == null ? '这次没有对错记录' : ('正确率/达标率 ' + pct(day.accuracy)));
    }
    return parts.join(' · ');
  }

  var PRACTICE_COPY = {
    waiting: WAIT_COPY,
    exit: '✕ 退出练习',
    end: '结束这次练习',
    start: '按视训师布置的练习开始',
    previewStart: '开始试玩',
    back: '返回',
    previewTag: '试玩',
    pursuitReady: '请按视训师布置的练习来做。孩子眼睛跟着小球，头尽量不要跟着转。做很短也可以结束并打卡。打卡后今日作业即算完成，不要求练满固定分钟。',
    hartReady: '请按视训师布置的练习来做。孩子注视中心红点，家长按孩子的回答点「对」或「错」。不点对错也可以打卡，正确率留空，不记成 0%。很短、正确率低也算完成。',
    discomfort: '如感不适，请立即停止，并联系视训师或医生。',
    previewReady: '试玩不会打卡，也不会记入今日完成。',
    pursuitLive: '眼睛跟着小球，头尽量不动。可以随时结束并打卡。不适请立即停止。',
    hartLive: '孩子盯住中心，家长点对或错。不点对错，正确率留空。不适请立即停止。',
    hartLiveEmpty: '还没有对错记录，正确率会留空',
    hartRebuildEmpty: '画面还没准备好。把窗口拉大一点，或点控制台里的「重新打乱字符」。',
    hartNoTarget: '字符还没准备好，这次不计入对错。',
    stopTitle: '这次先停在这里',
    previewStopTitle: '试玩结束',
    stopLead: '还没有打卡。打卡之后，首页才会显示「今日作业已完成」。很短、正确率低也可以打卡。',
    previewStopLead: '试玩不会打卡，也不会记入今日完成。',
    pursuitNoAccuracy: '追视小球本月看有效时长，不单列正确率。',
    noJudgeExtra: '回传后正确率留空，不记成 0%。',
    checkin: '打卡，记为今日完成',
    resume: '继续这次练习',
    skip: '先不打卡，返回',
    skipConfirm: '这次还没打卡，不会记入今日完成。确定返回？',
    exitConfirm: '今天的作业可以分成两次做。现在离开的话，这次不会打卡，时长也不会回传。',
    doneTitle: '今日作业已完成',
    doneLead: '这次打卡已回传给视训师。完成只看今天有没有打卡；有效时长、正确率/达标率供查看，不挡完成。',
    againLead: '还可以再练一次。多次打卡的有效时长会加在一起。',
    homeBtn: '回到首页看今日完成',
    again: '再练一次',
    fail: '这次还没记上，今日还不算完成。请再点一次打卡。',
    noChild: '没有关联到孩子，这次没法打卡。请从今日作业重新进入。',
    uploading: '打卡上传中…',
    taskAgain: '今天已经打过卡，还可以再做一次；多次打卡的时长会加在一起。',
    taskShort: '做很短也可以打卡。打卡后显示「今日作业已完成」，不要求练满固定分钟。',
    needBig: '需要在电脑或投屏大屏上完成。请换到大屏后，按视训师布置的练习开始；做很短也可以打卡。',
    pursuitDesc: '眼睛跟随小球。做很短也可以打卡，打卡即算今日完成。',
    hartDesc: '注视中心，辨认周围字符。没有对错记录时正确率留空，不记成 0%。',
    pursuitParam: '电脑/大屏 · 眼睛跟随小球 · 做很短也可以打卡',
    hartParam: '电脑/大屏 · 注视中心辨认字符 · 没有对错记录时正确率留空',
    settingReset: '已更换设置，这次的对错计数从头算。',
    pursuitCat: '打卡回传 · 有效时长',
    hartCat: '打卡回传 · 有效时长与正确率',
    rxTailLocked: '请按视训师布置的练习完成。追视小球、哈特表在大屏上做完后打卡即可，很短也算完成；其他项目仍按原来的方式回传。'
  };

  function clampSeconds(value) {
    var n = Number(value);
    if (!isNum(n) || n < 0) return 0;
    return Math.round(n);
  }

  function pursuitRecordData(session) {
    session = session || {};
    return {
      speed: session.speed,
      amp: session.amp,
      trajectory: session.trajectory || session.traj || 'h',
      actual: clampSeconds(session.actual != null ? session.actual : session.elapsed)
    };
  }

  function hartRecordData(session) {
    session = session || {};
    var correct = Number(session.correct);
    var wrong = Number(session.wrong);
    if (!isNum(correct) || correct < 0) correct = 0;
    if (!isNum(wrong) || wrong < 0) wrong = 0;
    var perDir = session.per_dir != null ? session.per_dir : session.perDir;
    return {
      charset: session.charset || 'mix',
      per_dir: perDir,
      correct: Math.round(correct),
      wrong: Math.round(wrong),
      actual: clampSeconds(session.actual != null ? session.actual : session.elapsed)
    };
  }

  function sessionReport(type, data) {
    var d = recordData({ data: data });
    var seconds = clampSeconds(d.actual != null ? d.actual : d.elapsed);
    var correct = 0;
    var wrong = 0;
    var accuracy = null;
    if (type === 'hart') {
      correct = Number(d.correct);
      wrong = Number(d.wrong);
      if (!isNum(correct) || correct < 0) correct = 0;
      if (!isNum(wrong) || wrong < 0) wrong = 0;
      correct = Math.round(correct);
      wrong = Math.round(wrong);
      var total = correct + wrong;
      accuracy = total > 0 ? correct / total : null;
    }
    return {
      seconds: seconds,
      correct: correct,
      wrong: wrong,
      accuracy: accuracy,
      durationText: '有效时长 ' + fmtDuration(seconds),
      accuracyText: type !== 'hart' ? '' : (accuracy == null ? '这次没有对错记录' : ('正确率/达标率 ' + pct(accuracy)))
    };
  }

  function speedLabel(speed) {
    if (typeof speed === 'number' && isFinite(speed)) return (Math.round(speed * 10) / 10) + ' 档';
    return { slow: '慢速', mid: '中速', fast: '快速' }[speed] || '';
  }

  function recordCaption(type, data) {
    var d = recordData({ data: data });
    var report = sessionReport(type, d);
    if (type === 'pursuit') {
      var traj = { h: '左右移动', v: '上下移动', cw: '顺时针', ccw: '逆时针', hj: '左右跳跃', vj: '上下跳跃' }[d.trajectory] || '追视';
      var speed = speedLabel(d.speed);
      var amp = d.amp != null ? ('摆幅 ' + d.amp + '%') : '';
      return ['追视小球', traj, speed, amp, report.durationText].filter(Boolean).join(' · ');
    }
    if (type === 'hart') {
      var judge = report.accuracy == null
        ? '这次没有对错记录'
        : ('答对 ' + report.correct + ' · 答错 ' + report.wrong + ' · ' + report.accuracyText);
      return '哈特表 · ' + judge + ' · ' + report.durationText;
    }
    return '';
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

  function tabClass(on, quiet) {
    return 'fb-tab' + (on ? ' on' : '') + (quiet ? ' is-quiet' : '');
  }

  function metricTabs(ex, series, metric) {
    if (ex.key !== 'hart') return '';
    var durationQuiet = !hasChartData(series, 'duration');
    var accuracyQuiet = !hasChartData(series, 'accuracy');
    var empty = !hasChartData(series, metric);
    return '<div class="fb-metric' + (empty ? ' is-quiet' : '') + '">' +
      '<button type="button" class="' + tabClass(metric === 'duration', durationQuiet) + '" data-fb-metric="duration">有效时长</button>' +
      '<button type="button" class="' + tabClass(metric === 'accuracy', accuracyQuiet) + '" data-fb-metric="accuracy">正确率/达标率</button>' +
      '</div>';
  }

  function chartBlock(ex, series, metric, range, audience) {
    var title = ex.icon + ' ' + ex.label + (metric === 'accuracy' ? ' · 正确率/达标率' : ' · 有效时长');
    var empty = !hasChartData(series, metric);
    var tabs = metricTabs(ex, series, metric);
    var head = '<div class="fb-chart-head"><div class="t">' + title + '</div>' + (empty ? '' : tabs) + '</div>';
    var body;
    if (empty) {
      body = '<div class="fb-empty">' + esc(emptyCopy(metric, range, audience));
      if (audience === 'parent') body += '<div><button type="button" class="linkbtn" data-open-help>关于 / 帮助</button></div>';
      body += '</div>' + tabs;
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
    return '<div class="fb-chart-block' + (empty ? ' is-empty' : '') + '" data-chart="' + ex.key + '" data-metric="' + metric + '">' + head + body + '</div>';
  }

  function renderPanel(opts) {
    opts = opts || {};
    var audience = opts.audience === 'therapist' ? 'therapist' : 'parent';
    var now = opts.now || new Date();
    var range = opts.range === 14 ? 14 : 7;
    var hartMetric = opts.hartMetric === 'accuracy' ? 'accuracy' : 'duration';
    var records = opts.records || [];
    var days = windowDays(range, now);
    var assignmentAware = audience === 'parent' && Object.prototype.hasOwnProperty.call(opts, 'prescriptions');
    var childId = opts.childId || '';
    var html = '';
    if (audience === 'parent') {
      html += '<div class="fb-child">' + esc(opts.childName || '孩子') + '</div>';
    }
    if (opts.showNote !== false) html += noteBlock(audience);
    for (var i = 0; i < LOCKED.length; i++) {
      var ex = LOCKED[i];
      var todayDays = windowDays(1, now);
      var practice = bucket(records, ex.key, todayDays)[todayDays.length - 1];
      var status = practice;
      if (assignmentAware) {
        status = todayStatus(records, ex.key, now, opts.prescriptions, childId);
        if (!status.waiting && !status.assigned) continue;
      }
      var sub = auxText(practice, ex.key);
      if (audience === 'therapist') sub = fmtDayCN(now) + ' · ' + sub;
      var rowDone = assignmentAware ? !!status.done : !!practice.done;
      var waiting = assignmentAware && !!status.waiting;
      html += '<div class="fb-row" data-ex="' + ex.key + '" data-done="' + (rowDone ? '1' : '0') + '"' +
        (waiting ? ' data-wait="1"' : '') +
        (assignmentAware ? (' data-upload="' + (status.uploadAllowed ? '1' : '0') + '"') : '') + '>' +
        '<span class="fb-icon" aria-hidden="true">' + ex.icon + '</span>' +
        '<div class="fb-main"><div class="t">' + ex.label + '</div><div class="s">' + esc(sub) + '</div></div>' +
        '<span class="fb-badge ' + (rowDone ? 'done' : 'todo') + '">' + esc(badgeText(rowDone, audience, assignmentAware ? status : null)) + '</span>' +
        '</div>';
    }
    var quietRange = true;
    for (var q = 0; q < LOCKED.length; q++) {
      if (hasChartData(bucket(records, LOCKED[q].key, days), 'duration')) quietRange = false;
    }
    html += '<div class="fb-switch' + (quietRange ? ' is-quiet' : '') + '">' +
      '<button type="button" class="' + tabClass(range === 7, quietRange) + '" data-fb-range="7">近 7 日</button>' +
      '<button type="button" class="' + tabClass(range === 14, quietRange) + '" data-fb-range="14">近 14 日</button>' +
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
    WAIT_COPY: WAIT_COPY,
    todayTitle: todayTitle,
    rxItems: rxItems,
    todayPrescription: todayPrescription,
    parentTasks: parentTasks,
    uploadGate: uploadGate,
    parentRxGate: parentRxGate,
    renderParentRxList: renderParentRxList,
    todayStatus: todayStatus,
    groupByChild: groupByChild,
    badgeText: badgeText,
    noteText: noteText,
    noteShort: noteShort,
    noteBlock: noteBlock,
    fmtDuration: fmtDuration,
    renderPanel: renderPanel,
    emptyCopy: emptyCopy,
    PRACTICE_COPY: PRACTICE_COPY,
    pursuitRecordData: pursuitRecordData,
    hartRecordData: hartRecordData,
    sessionReport: sessionReport,
    recordCaption: recordCaption
  };
});
