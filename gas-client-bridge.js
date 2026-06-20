/**
 * gas-client-bridge.js
 * GitHub Pages やローカル環境から GAS Web App に通信するための RPC ブリッジ
 * v2: Google Identity Services (GIS) による1クリックログイン移行とデザイン刷新
 */
(function () {
  if (typeof window === 'undefined') return;

  // GAS 側の google.script.run が存在する場合は何もしない（GAS環境互換性維持）
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    console.log('[Bridge] GAS環境を検出。ネイティブの google.script.run を使用します。');
    return;
  }

  // ==========================================
  // 【設定】GASデプロイURL
  // ==========================================
  // デプロイ（API用 / 実行ユーザー: 自分、アクセス権: 全員）
  var GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyb2zGD6bxSF-WMSSQdV37vbw9vusJ_SCWDCawgd9ayOZ74bi02fKyvWlnMfn8Jhu88Xg/exec';

  // Google OAuth2 クライアントID
  var GOOGLE_CLIENT_ID = '85113522675-vrervnlgtsaqgk1iippfqucc3qkips6l.apps.googleusercontent.com';
  // ==========================================

  // =============================================
  // 1. 起動時: URLパラメータからトークンを回収 (互換性維持)
  // =============================================
  var params = new URLSearchParams(window.location.search);
  var tokenFromUrl = params.get('token');

  if (tokenFromUrl) {
    localStorage.setItem('gas_id_token', tokenFromUrl);
    var cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
  }

  // =============================================
  // 2. google.script.run のエミュレート
  // =============================================
  window.google = window.google || {};
  window.google.script = window.google.script || {};

  window.google.script.run = {
    withSuccessHandler: function (successCallback) {
      return {
        withFailureHandler: function (failureCallback) {
          return new Proxy({}, {
            get: function (target, methodName) {
              return function () {
                var args = Array.prototype.slice.call(arguments);
                var token = localStorage.getItem('gas_id_token');

                if (!token) {
                  console.warn('[Bridge] トークンなし。ログイン画面を表示します。');
                  triggerLoginFlow();
                  return;
                }

                var payload = {
                  action: 'rpc',
                  method: methodName,
                  args: args,
                  token: token
                };

                fetch(GAS_API_URL, {
                  method: 'POST',
                  mode: 'cors',
                  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                  body: JSON.stringify(payload)
                })
                  .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                  })
                  .then(function (data) {
                    if (data.error) {
                      if (data.authError) {
                        console.warn('[Bridge] トークン無効。再ログインします。');
                        localStorage.removeItem('gas_id_token');
                        window.location.reload();
                      } else {
                        failureCallback(new Error(data.message));
                      }
                    } else {
                      successCallback(data.result);
                    }
                  })
                  .catch(function (err) {
                    console.error('[Bridge] API呼び出し失敗:', err);
                    failureCallback(err);
                  });
              };
            }
          });
        }
      };
    }
  };

  // =============================================
  // 3. GIS ログインフローの制御
  // =============================================
  var loginScreenShown = false;

  function triggerLoginFlow() {
    if (loginScreenShown) return;
    loginScreenShown = true;

    // DOM構築完了後にUIを表示
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', showAndInitLogin);
    } else {
      showAndInitLogin();
    }
  }

  function showAndInitLogin() {
    showLoginScreen();
    ensureDependencies(function () {
      initGis();
    });
  }

  // スクリプトとTailwindの動的ロード
  function ensureDependencies(callback) {
    var tailwindLoaded = false;
    var gisLoaded = false;

    function checkReady() {
      if (tailwindLoaded && gisLoaded) {
        callback();
      }
    }

    // 1. Tailwind CSS (存在しない場合のみロード)
    if (typeof Tailwind !== 'undefined' || document.querySelector('script[src*="tailwindcss.com"]')) {
      tailwindLoaded = true;
    } else {
      var script = document.createElement('script');
      script.src = 'https://cdn.tailwindcss.com';
      script.onload = function () {
        tailwindLoaded = true;
        checkReady();
      };
      document.head.appendChild(script);
    }

    // 2. Google GSI Client (存在しない場合のみロード)
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      gisLoaded = true;
    } else {
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = function () {
        gisLoaded = true;
        checkReady();
      };
      document.head.appendChild(script);
    }

    if (tailwindLoaded && gisLoaded) {
      callback();
    }
  }

  // ガラスモーフィズムログイン画面の表示
  function showLoginScreen() {
    // 既存のコンテンツを非表示にする
    var hideStyle = document.createElement('style');
    hideStyle.id = 'gas-bridge-hide-app-style';
    hideStyle.innerHTML = '#app, #loadingSpinner, #loadingOverlay, .app-container { display: none !important; }';
    document.head.appendChild(hideStyle);

    // ログインコンテナの作成
    var loginContainer = document.createElement('div');
    loginContainer.id = 'gas-bridge-login-container';
    loginContainer.className = 'fixed inset-0 flex items-center justify-center bg-gradient-to-tr from-slate-100 via-blue-50 to-slate-200 p-4 z-[99999]';

    var cardHtml = 
      '<div class="bg-white/80 backdrop-blur-lg border border-white/20 shadow-2xl rounded-2xl p-8 max-w-md w-full text-center transition-all duration-300 transform hover:scale-[1.01]">' +
        '<div class="mb-6 flex justify-center">' +
          '<div class="p-3 bg-blue-500/10 rounded-full text-blue-600">' +
            '<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />' +
            '</svg>' +
          '</div>' +
        '</div>' +
        '<h1 class="text-2xl font-bold text-slate-800 mb-2">UNINippo ログイン</h1>' +
        '<p class="text-sm text-slate-500 mb-8">Google Identity Services を使用して安全にサインインします。</p>' +
        '<div class="flex justify-center mb-6">' +
          '<div id="gis-button-container"></div>' +
        '</div>' +
        '<div class="mt-8 border-t border-slate-200/60 pt-6">' +
          '<button id="toggle-mock-login" class="text-xs text-slate-400 hover:text-blue-500 transition-colors font-medium focus:outline-none">' +
            '💻 開発用デバッグログインを表示' +
          '</button>' +
          '<div id="mock-login-form" class="hidden mt-4 bg-slate-50 border border-slate-100 rounded-xl p-4 text-left">' +
            '<label class="block text-xs font-semibold text-slate-500 mb-1">モックメールアドレス</label>' +
            '<input type="email" id="mock-email-input" value="mock-parent@gmail.com" class="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-3" />' +
            '<button id="btn-mock-login" class="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors">' +
              'モックとしてログイン' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    loginContainer.innerHTML = cardHtml;
    document.body.appendChild(loginContainer);

    // イベント設定
    document.getElementById('toggle-mock-login').addEventListener('click', function () {
      var form = document.getElementById('mock-login-form');
      if (form.classList.contains('hidden')) {
        form.classList.remove('hidden');
        this.textContent = '💻 デバッグログインを非表示';
      } else {
        form.classList.add('hidden');
        this.textContent = '💻 開発用デバッグログインを表示';
      }
    });

    document.getElementById('btn-mock-login').addEventListener('click', function () {
      var email = document.getElementById('mock-email-input').value;
      if (email) {
        localStorage.setItem('gas_id_token', email);
        window.location.reload();
      }
    });
  }

  // GIS SDKの初期化とボタン描画
  function initGis() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
      console.error('[Bridge] Google Accounts GIS SDK not loaded');
      return;
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: function (response) {
        if (response && response.credential) {
          console.log('[Bridge] Google サインイン成功。IDトークンを保存します。');
          localStorage.setItem('gas_id_token', response.credential);
          window.location.reload();
        } else {
          console.error('[Bridge] Google サインインに失敗しました。');
        }
      }
    });

    google.accounts.id.renderButton(
      document.getElementById('gis-button-container'),
      { theme: 'outline', size: 'large', width: '240' }
    );
  }

  // 起動時の確認
  var token = localStorage.getItem('gas_id_token');
  if (!token) {
    triggerLoginFlow();
  }

})();
