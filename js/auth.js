/* 登录域：从 cloud.html 挪出的登录/注册相关逻辑。依赖 window.$ / window.sb / window.state；afterLogin 调用 window.home（由 cloud 内联提供）。 */
(function (w) {
  var T = (w.Tongzhi = w.Tongzhi || {});
  var signupRole = 'parent';

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
    $('login-view').style.display = 'block';
    $('main-view').style.display = 'none';
    setSignupRole('parent');
  }

  function showMain() {
    $('login-view').style.display = 'none';
    $('main-view').style.display = 'block';
  }

  function showMsg(text, ok) {
    var m = $('msg');
    m.textContent = text;
    m.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  function setSignupRole(r) {
    signupRole = r;
    $('role-parent-btn').classList.toggle('active', r === 'parent');
    $('role-therapist-btn').classList.toggle('active', r === 'therapist');
    $('role-parent-btn').setAttribute('aria-pressed', r === 'parent' ? 'true' : 'false');
    $('role-therapist-btn').setAttribute('aria-pressed', r === 'therapist' ? 'true' : 'false');
    $('code-field').style.display = r === 'therapist' ? 'block' : 'none';
  }

  async function signUp() {
    var sb = w.sb;
    var email = $('email').value.trim(), password = $('password').value;
    if (!email || !password) { showMsg('请填写邮箱和密码'); return; }
    var code = $('therapist-code').value.trim();
    if (signupRole === 'therapist' && !code) { showMsg('视训师需要填写授权码'); return; }
    showMsg('正在注册……');
    try {
      var res = await sb.auth.signUp({ email: email, password: password });
      if (res.error) { showMsg('注册失败：' + errText(res.error.message)); return; }
      // 视训师：注册后立刻用授权码升级身份
      if (signupRole === 'therapist') {
        if (!res.data.session) { showMsg('注册成功，但未自动登录。请点「登录」后，在首页输入授权码升级', true); return; }
        var r = await sb.rpc('register_therapist', { p_code: code });
        if (r.error) { showMsg('升级失败：' + errText(r.error.message), false); try { await sb.auth.signOut(); } catch (e2) {} showLogin(); return; }
        if (r.data === false) { showMsg('授权码错误，账号已注册为「家长」。请用此邮箱登录，在首页点「我是视训师」重试', false); try { await sb.auth.signOut(); } catch (e2) {} showLogin(); return; }
        showMsg('注册成功，已成为视训师', true); await afterLogin(res.data.user);
        return;
      }
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
  T.setSignupRole = setSignupRole;
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
  w.setSignupRole = setSignupRole;
  w.signUp = signUp;
  w.signIn = signIn;
  w.signOut = signOut;
  w.afterLogin = afterLogin;
  w.loadProfile = loadProfile;
})(window);
