/* 登录域最小工具：仅抽 auth 立刻用到的 $。其余工具仍留在 cloud.html。 */
(function (w) {
  var T = (w.Tongzhi = w.Tongzhi || {});

  function $(id) {
    return document.getElementById(id);
  }

  T.$ = $;
  w.$ = $;
})(window);
