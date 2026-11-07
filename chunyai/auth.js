/* 春芽登录域：逻辑自仓库 js/auth.js 照抄。依赖 window.sb / window.state；afterLogin 调用 window.home（春芽页内联占位分流）。
   适配：显隐用清空 inline display，让 login-form.css 的 flex 列继续居中；根目录 cloud 仍用 display:block。 */
(function (w) {
  var T = (w.Tongzhi = w.Tongzhi || {});

  function $(id) {
    return (w.$ || document.getElementById.bind(document))(id);
  }

  // 把 Supabase 英文错误映射成中文可执行文案
  function errText(msg) {
    msg = String(msg || '');
    if (/invalid login credentials/i.test(msg)) return '邮箱或密码错误';
    if (/already registered/i.test(msg)) return '该邮箱已注册，请直接登录';
    if (/email not confirmed/i.test(msg)) return '邮箱未确认，请先到邮箱点确认链接';
    if (/duplicate key/i.test(msg)) return '数据重复，请勿重复提交';
    if (/row-level security|policy/i.test(msg)) return '没有权限操作';
    if (/jwt expired|invalid jwt|token expired/i.test(msg)) return '登录已过期，请重新登录';
    if (/failed to fetch|network/i.test(msg)) return '网络连接失败，请检查网络后重试';
    if (/rate limit/i.test(msg)) return '操作太频繁，请稍后再试';
    return msg;
  }

  function thrownAuthText(e) {
    var msg = (e && e.message) ? e.message : '';
    return errText(msg) || '网络连接失败，请检查网络后重试';
  }

  function showLogin() {
    $('login-view').style.display = '';
    $('main-view').style.display = 'none';
  }

  function showMain() {
    $('login-view').style.display = 'none';
    $('main-view').style.display = '';
  }

  function showMsg(text, ok) {
    var m = $('msg');
    m.textContent = text;
    m.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  async function signUp() {
    var sb = w.sb;
    var email = $('email').value.trim(), password = $('password').value;
    if (!email || !password) { showMsg('请填写邮箱和密码'); return; }
    showMsg('正在注册……');
    try {
      var res = await sb.auth.signUp({ email: email, password: password });
      if (res.error) { showMsg('注册失败：' + errText(res.error.message)); return; }
      // 注册一律按家长。授权码升级（register_therapist）由老板后续再加，此处不调用。
      if (res.data.session) { showMsg('注册成功，已自动登录', true); await afterLogin(res.data.user); }
      else { showMsg('注册成功！请点「登录」进入', true); }
    } catch (e) {
      showMsg('注册失败：' + thrownAuthText(e));
    }
  }

  async function signIn() {
    var sb = w.sb;
    var email = $('email').value.trim(), password = $('password').value;
    if (!email || !password) { showMsg('请填写邮箱和密码'); return; }
    showMsg('正在登录……');
    try {
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) { showMsg('登录失败：' + errText(res.error.message)); return; }
      await afterLogin(res.data.user);
    } catch (e) {
      showMsg('登录失败：' + thrownAuthText(e));
    }
  }

  async function signOut() {
    await w.sb.auth.signOut();
    w.state.user = null;
    w.state.profile = null;
    showLogin();
  }

  // 登录后：读档案 + 分流（home 由 cloud 内联提供）
  async function afterLogin(user) {
    w.state.user = user;
    await loadProfile();
    showMain();
    if (typeof w.home === 'function') w.home();
  }

  async function loadProfile() {
    var res = await w.sb.from('profiles').select('role, name, family_id').eq('id', w.state.user.id).single();
    if (res.error || !res.data) { w.state.profile = { role: 'parent', name: '', family_id: null }; return; }
    w.state.profile = res.data;
  }

  T.errText = errText;
  T.thrownAuthText = thrownAuthText;
  T.showLogin = showLogin;
  T.showMain = showMain;
  T.showMsg = showMsg;
  T.signUp = signUp;
  T.signIn = signIn;
  T.signOut = signOut;
  T.afterLogin = afterLogin;
  T.loadProfile = loadProfile;

  // 保持原函数名可被 cloud 内联绑定： $('login-btn').onclick = signIn
  w.errText = errText;
  w.thrownAuthText = thrownAuthText;
  w.showLogin = showLogin;
  w.showMain = showMain;
  w.showMsg = showMsg;
  w.signUp = signUp;
  w.signIn = signIn;
  w.signOut = signOut;
  w.afterLogin = afterLogin;
  w.loadProfile = loadProfile;
})(window);
