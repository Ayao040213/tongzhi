/* 视训师孩子档案「每日回传」：周条可展开月历，下面只列选中日。
 * 不改 records 表，也不做按日索引。日期边界复用 Feedback.dayKey / windowDays(14)，
 * 与 cloud.html 的 feedbackSinceIso（本地今天往前共 14 天）对齐，在本地分桶。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DailyReturns = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var COPY = {
    title: '每日回传',
    empty: '这一天还没有回传',
    expand: '展开月历',
    collapse: '收起月历',
    prevMonth: '上月',
    nextMonth: '下月',
    loading: '读取中…',
    weekday: ['一', '二', '三', '四', '五', '六', '日']
  };

  var HOMEWORK = { pursuit: true, hart: true };
  var ICONS = {
    eye: '👁️',
    marsden: '🎾',
    peripheral: '🎯',
    custom: '📌',
    pursuit: '👀',
    hart: '🎯'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fb() {
    var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null);
    return g && g.Feedback;
  }

  function asDate(input) {
    if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
    var d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function dayKey(input) {
    var api = fb();
    if (api && api.dayKey) return api.dayKey(input);
    var d = asDate(input);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function monthKey(date) {
    var d = asDate(date);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function parseMonthKey(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(key || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, 1);
  }

  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  function mondayOnOrBefore(date) {
    var day = date.getDay();
    var delta = day === 0 ? -6 : 1 - day;
    return addDays(date, delta);
  }

  function sinceDate(now) {
    var end = now ? new Date(now.getTime()) : new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 13);
    return end;
  }

  function sinceIso(now) {
    return sinceDate(now).toISOString();
  }

  function loadedDays(now) {
    var api = fb();
    if (api && api.windowDays) return api.windowDays(14, now || new Date());
    var end = now ? new Date(now.getTime()) : new Date();
    end.setHours(0, 0, 0, 0);
    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = addDays(end, -i);
      days.push({ key: dayKey(d), today: i === 0 });
    }
    return days;
  }

  function windowMap(now) {
    var days = loadedDays(now);
    var map = {};
    for (var i = 0; i < days.length; i++) map[days[i].key] = true;
    return map;
  }

  function inWindow(key, now) {
    return !!windowMap(now)[key];
  }

  function recordData(r) {
    var d = r && r.data;
    if (!d) return {};
    if (typeof d === 'string') {
      try { return JSON.parse(d) || {}; } catch (e) { return {}; }
    }
    return d;
  }

  function asList(v) {
    if (!v) return [];
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch (e) { return []; }
    }
    return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
  }

  function mediaPaths(record) {
    return {
      media: asList(record && record.media),
      originals: asList(recordData(record).originals)
    };
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function eyeStageName(stage) {
    return stage === 'left' ? '左眼' : (stage === 'double' ? '双眼' : '右眼');
  }

  function recordTitle(record) {
    var data = recordData(record);
    var type = record && record.type;
    var api = fb();
    if ((type === 'pursuit' || type === 'hart') && api && api.recordCaption) {
      var cap = api.recordCaption(type, data);
      if (cap) return cap;
    }
    if (type === 'peripheral') return '周边训练 · 命中 ' + num(data.hit) + ' 次 · 未中 ' + num(data.miss) + ' 次';
    if (type === 'eye') return '眼位照 · ' + eyeStageName(data.stage);
    if (type === 'marsden') {
      var slots = asList(data.slots);
      return '马斯登球 · ' + (slots.length ? (slots.length + ' 段视频') : '视频');
    }
    if (type === 'custom') return '自定义训练 · ' + (data.custom_title || '回传');
    if (type === 'pursuit') return '追视小球';
    if (type === 'hart') return '哈特表';
    return type || '回传';
  }

  function fmtClock(input) {
    var d = asDate(input);
    if (!d) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function sortByTime(records) {
    var rows = [];
    var list = records || [];
    for (var i = 0; i < list.length; i++) rows.push({ r: list[i], i: i });
    rows.sort(function (a, b) {
      var ta = asDate(a.r && a.r.created_at);
      var tb = asDate(b.r && b.r.created_at);
      var na = ta ? ta.getTime() : 0;
      var nb = tb ? tb.getTime() : 0;
      if (na !== nb) return na - nb;
      return a.i - b.i;
    });
    var out = [];
    for (var j = 0; j < rows.length; j++) out.push(rows[j].r);
    return out;
  }

  function recordsOnDay(records, key) {
    var out = [];
    var list = records || [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      if (dayKey(list[i].created_at) === key) out.push(list[i]);
    }
    return sortByTime(out);
  }

  function summaryText(records) {
    var list = records || [];
    var hw = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && HOMEWORK[list[i].type]) hw += 1;
    }
    var text = list.length + ' 条回传';
    if (hw > 0) text += ' · ' + hw + ' 项作业相关';
    return text;
  }

  function weekdayChar(date) {
    return COPY.weekday[(date.getDay() + 6) % 7];
  }

  function weekDates(anchor) {
    var start = mondayOnOrBefore(anchor);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(start, i));
    return days;
  }

  function monthDates(view) {
    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    var last = new Date(view.getFullYear(), view.getMonth() + 1, 0);
    var start = mondayOnOrBefore(first);
    var end = addDays(mondayOnOrBefore(last), 6);
    var days = [];
    for (var d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) days.push(d);
    return days;
  }

  function monthHits(view, now) {
    var map = windowMap(now);
    var last = new Date(view.getFullYear(), view.getMonth() + 1, 0);
    for (var day = 1; day <= last.getDate(); day++) {
      if (map[dayKey(new Date(view.getFullYear(), view.getMonth(), day))]) return true;
    }
    return false;
  }

  function initialState(now) {
    var today = now || new Date();
    return {
      mode: 'week',
      selectedKey: dayKey(today),
      viewMonth: monthKey(today)
    };
  }

  function reduce(state, action, now) {
    var today = now || new Date();
    var base = state || initialState(today);
    var next = {
      mode: base.mode === 'month' ? 'month' : 'week',
      selectedKey: base.selectedKey || dayKey(today),
      viewMonth: base.viewMonth || monthKey(today)
    };
    if (!inWindow(next.selectedKey, today)) next.selectedKey = dayKey(today);
    if (!action) return next;
    if (action.type === 'select' && inWindow(action.key, today)) {
      next.selectedKey = action.key;
    } else if (action.type === 'toggle') {
      next.mode = next.mode === 'month' ? 'week' : 'month';
      if (next.mode === 'month') next.viewMonth = monthKey(parseKey(next.selectedKey) || today);
    } else if (action.type === 'month' && next.mode === 'month') {
      var cur = parseMonthKey(next.viewMonth) || new Date(today.getFullYear(), today.getMonth(), 1);
      var shifted = new Date(cur.getFullYear(), cur.getMonth() + (action.delta || 0), 1);
      if (monthHits(shifted, today)) next.viewMonth = monthKey(shifted);
    }
    return next;
  }

  function dayCell(date, ctx) {
    var key = dayKey(date);
    var open = !!ctx.inWindow[key];
    var count = ctx.counts[key] || 0;
    var on = key === ctx.selectedKey;
    var today = key === ctx.todayKey;
    var pad = ctx.view && date.getMonth() !== ctx.view.getMonth();
    var cls = 'dr-day' + (on ? ' is-on' : '') + (open ? '' : ' is-out') + (pad && !on ? ' is-pad' : '');
    var dot = '<span class="dr-dot' + (count > 0 && open ? '' : ' is-off') + '"></span>';
    var head = ctx.showWeekday
      ? '<span class="dr-wd">' + (today ? '今' : weekdayChar(date)) + '</span>'
      : '';
    var inner = head + '<span class="dr-num">' + date.getDate() + '</span>' + dot;
    if (!open) return '<span class="' + cls + '" data-dr-key="' + key + '">' + inner + '</span>';
    var label = (date.getMonth() + 1) + '月' + date.getDate() + '日' +
      (today ? '，今天' : '') + '，' + (count ? (count + ' 条回传') : '没有回传');
    return '<button type="button" class="' + cls + '" data-dr-key="' + key + '" data-dr-day="' + key + '" aria-pressed="' +
      (on ? 'true' : 'false') + '" aria-label="' + esc(label) + '">' + inner + '</button>';
  }

  function countByDay(records) {
    var map = {};
    var list = records || [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      var key = dayKey(list[i].created_at);
      if (!key) continue;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }

  function calendarHtml(state, now, counts) {
    var today = now || new Date();
    var selected = parseKey(state.selectedKey) || today;
    var inWin = windowMap(today);
    var html = '';
    if (state.mode === 'month') {
      var view = parseMonthKey(state.viewMonth) || new Date(selected.getFullYear(), selected.getMonth(), 1);
      var prev = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      var next = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      html += '<div class="dr-cal-bar is-month">';
      html += '<div class="dr-month-nav">';
      if (monthHits(prev, today)) {
        html += '<button type="button" class="linkbtn" data-dr-month="-1">' + COPY.prevMonth + '</button>';
      }
      html += '<span class="dr-month-label">' + view.getFullYear() + '年' + (view.getMonth() + 1) + '月</span>';
      if (monthHits(next, today)) {
        html += '<button type="button" class="linkbtn" data-dr-month="1">' + COPY.nextMonth + '</button>';
      }
      html += '</div>';
      html += '<button type="button" class="linkbtn" data-dr-toggle aria-expanded="true">' + COPY.collapse + '</button>';
      html += '</div>';
      html += '<div class="dr-month" role="group" aria-label="月历">';
      for (var w = 0; w < COPY.weekday.length; w++) {
        html += '<div class="dr-wdhead">' + COPY.weekday[w] + '</div>';
      }
      var cells = monthDates(view);
      for (var c = 0; c < cells.length; c++) {
        html += dayCell(cells[c], {
          inWindow: inWin,
          counts: counts,
          selectedKey: state.selectedKey,
          todayKey: dayKey(today),
          view: view,
          showWeekday: false
        });
      }
      html += '</div>';
      return html;
    }
    html += '<div class="dr-cal-bar">';
    html += '<button type="button" class="linkbtn" data-dr-toggle aria-expanded="false">' + COPY.expand + '</button>';
    html += '</div>';
    html += '<div class="dr-week" role="group" aria-label="本周">';
    var week = weekDates(selected);
    for (var i = 0; i < week.length; i++) {
      html += dayCell(week[i], {
        inWindow: inWin,
        counts: counts,
        selectedKey: state.selectedKey,
        todayKey: dayKey(today),
        view: null,
        showWeekday: true
      });
    }
    html += '</div>';
    return html;
  }

  function rowHtml(record) {
    var id = record && record.id ? String(record.id) : '';
    var type = record && record.type ? String(record.type) : '';
    var badge = HOMEWORK[type] ? '<span class="fb-badge done">完成</span>' : '';
    var del = id
      ? '<button type="button" class="btn btn-ghost btn-small" data-dr-delete="' + esc(id) + '" data-dr-type="' + esc(type) + '">删除</button>'
      : '';
    return '<div class="list-item" data-dr-rec="' + esc(id) + '">' +
      '<span class="icon" aria-hidden="true">' + (ICONS[type] || '') + '</span>' +
      '<div><div class="t">' + esc(recordTitle(record)) + '</div>' +
      '<div class="s">' + esc(fmtClock(record && record.created_at)) + '</div>' +
      '<div class="dr-media" data-dr-media="' + esc(id) + '"></div></div>' +
      badge + del + '</div>';
  }

  function listHtml(records) {
    if (!records.length) return '<div class="fb-empty">' + esc(COPY.empty) + '</div>';
    var html = '';
    for (var i = 0; i < records.length; i++) html += rowHtml(records[i]);
    return html;
  }

  function shell(inner) {
    return '<div class="dr" data-dr-root><div class="sect">' + COPY.title + '</div>' + inner + '</div>';
  }

  function render(opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var state = reduce(opts.state, null, now);
    var counts = countByDay(opts.records);
    var dayRecords = recordsOnDay(opts.records, state.selectedKey);
    return shell(
      '<div class="dr-cal">' + calendarHtml(state, now, counts) + '</div>' +
      '<p class="dr-sum">' + esc(summaryText(dayRecords)) + '</p>' +
      '<div class="dr-list">' + listHtml(dayRecords) + '</div>'
    );
  }

  function loadingHtml() {
    return shell('<div class="empty">' + COPY.loading + '</div>');
  }

  function errorHtml(message) {
    return shell('<div class="empty">' + esc(message || COPY.title) + '</div>');
  }

  return {
    COPY: COPY,
    dayKey: dayKey,
    sinceIso: sinceIso,
    inWindow: inWindow,
    recordData: recordData,
    recordTitle: recordTitle,
    mediaPaths: mediaPaths,
    recordsOnDay: recordsOnDay,
    summaryText: summaryText,
    initialState: initialState,
    reduce: reduce,
    render: render,
    loadingHtml: loadingHtml,
    errorHtml: errorHtml
  };
});
